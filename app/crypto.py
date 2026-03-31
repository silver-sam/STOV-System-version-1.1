import os
from cryptography.fernet import Fernet
import base64
import json

# --- MOCK FLAG ---
# Set MOCK_CRYPTO=true in your deployment environment (like Render) to bypass tenseal.
MOCK_CRYPTO = os.getenv("MOCK_CRYPTO", "false").lower() in ('true', '1', 't')

if not MOCK_CRYPTO:
    try:
        import tenseal as ts
    except ImportError:
        print("ERROR: Tenseal library not found. Running in mocked crypto mode.")
        MOCK_CRYPTO = True
else:
    print("WARNING: Homomorphic encryption is mocked because MOCK_CRYPTO is set. DO NOT USE IN PRODUCTION.")


MFA_ENCRYPTION_KEY = os.getenv("MFA_ENCRYPTION_KEY")
if not MFA_ENCRYPTION_KEY:
    # Fallback to the exact key used to encrypt existing users in your DB
    MFA_ENCRYPTION_KEY = b'qsMr2sDL8UXFviWYHjQWNFBdgFBHZM7thhPqF-cWTUU='

f = Fernet(MFA_ENCRYPTION_KEY)

def encrypt_mfa_secret(secret: str) -> str:
    """Encrypts the MFA secret before storing it in the database."""
    return f.encrypt(secret.encode()).decode()

def decrypt_mfa_secret(encrypted_secret: str) -> str:
    """Decrypts the MFA secret from the database."""
    return f.decrypt(encrypted_secret.encode()).decode()

def generate_election_keys():
    """
    Generates the mathematical environment for a new election.
    """
    if MOCK_CRYPTO:
        return b"mock_public_key", b"mock_secret_key"

    context = ts.context(
        ts.SCHEME_TYPE.BFV,
        poly_modulus_degree=4096,
        plain_modulus=1032193
    )
    context.generate_galois_keys()
    context.generate_relin_keys()
    
    secret_context_bytes = context.serialize(save_secret_key=True)
    context.make_context_public() 
    public_context_bytes = context.serialize()
    
    return public_context_bytes, secret_context_bytes

def encrypt_vote(public_context_bytes, vote_array):
    """Takes a vote array (e.g., [1, 0, 0]) and encrypts it."""
    if MOCK_CRYPTO:
        return base64.b64encode(json.dumps(vote_array).encode('utf-8'))

    context = ts.context_from(public_context_bytes)
    encrypted_vector = ts.bfv_vector(context, vote_array)
    return encrypted_vector.serialize()

def tally_all_encrypted_votes(public_context_bytes, encrypted_vote_bytes_iterable):
    """
    Adds an entire iterable of encrypted votes together.
    """
    if MOCK_CRYPTO:
        master_tally = None
        for vote_bytes in encrypted_vote_bytes_iterable:
            try:
                vote_array = json.loads(base64.b64decode(vote_bytes).decode('utf-8'))
                if master_tally is None:
                    master_tally = vote_array
                else:
                    for i in range(len(master_tally)):
                        master_tally[i] += vote_array[i]
            except (json.JSONDecodeError, base64.binascii.Error):
                # Skip corrupted/invalid mock votes
                continue
        
        if master_tally is None:
            return None
            
        return base64.b64encode(json.dumps(master_tally).encode('utf-8'))

    context = ts.context_from(public_context_bytes)
    vote_iterator = iter(encrypted_vote_bytes_iterable)
    
    try:
        first_vote_bytes = next(vote_iterator)
    except StopIteration:
        return None
        
    master_tally = ts.bfv_vector_from(context, first_vote_bytes)
    
    for vote_bytes in vote_iterator:
        next_vote = ts.bfv_vector_from(context, vote_bytes)
        master_tally += next_vote
        
    return master_tally.serialize()

def decrypt_tally(secret_context_bytes, encrypted_tally_bytes):
    """Used at the very end of the election to reveal the final results."""
    if MOCK_CRYPTO:
        return json.loads(base64.b64decode(encrypted_tally_bytes).decode('utf-8'))

    secret_context = ts.context_from(secret_context_bytes)
    encrypted_tally = ts.bfv_vector_from(secret_context, encrypted_tally_bytes)
    final_tally = encrypted_tally.decrypt()
    return final_tally