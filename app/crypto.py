import tenseal as ts
import os
from cryptography.fernet import Fernet

# Use an environment variable for the secret key in production!
MFA_ENCRYPTION_KEY = os.getenv("MFA_ENCRYPTION_KEY", b'qsMr2sDL8UXFviWYHjQWNFBdgFBHZM7thhPqF-cWTUU=')
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
    context = ts.context(
        ts.SCHEME_TYPE.BFV,
        poly_modulus_degree=4096,
        plain_modulus=1032193
    )
    context.generate_galois_keys()
    context.generate_relin_keys()
    
    # 1. Serialize the FULL context (which includes the secret key).
    # This acts as our master key to decrypt the final tally.
    secret_context_bytes = context.serialize(save_secret_key=True)
    
    # 2. Drop the secret key from the environment
    context.make_context_public() 
    
    # 3. Serialize the PUBLIC context. 
    # This is what voters use to encrypt their ballots.
    public_context_bytes = context.serialize()
    
    return public_context_bytes, secret_context_bytes

def encrypt_vote(public_context_bytes, vote_array):
    """Takes a vote array (e.g., [1, 0, 0]) and encrypts it."""
    context = ts.context_from(public_context_bytes)
    encrypted_vector = ts.bfv_vector(context, vote_array)
    return encrypted_vector.serialize()

def tally_all_encrypted_votes(public_context_bytes, encrypted_vote_bytes_iterable):
    """
    The Professional Way: Adds an entire iterable of encrypted votes together at once
    without constantly destroying and rebuilding the mathematical context.
    """
    context = ts.context_from(public_context_bytes)
    
    vote_iterator = iter(encrypted_vote_bytes_iterable)
    
    try:
        first_vote_bytes = next(vote_iterator)
    except StopIteration:
        return None
        
    # Start the master tally with the very first vote
    master_tally = ts.bfv_vector_from(context, first_vote_bytes)
    
    # Add all subsequent votes to the master tally
    for vote_bytes in vote_iterator:
        next_vote = ts.bfv_vector_from(context, vote_bytes)
        master_tally += next_vote
        
    # Serialize only ONCE at the very end
    return master_tally.serialize()

def decrypt_tally(secret_context_bytes, encrypted_tally_bytes):
    """Used at the very end of the election to reveal the final results."""
    # Load the context that STILL HAS the secret key inside it
    secret_context = ts.context_from(secret_context_bytes)
    
    # Load the ciphertext using the secret context
    encrypted_tally = ts.bfv_vector_from(secret_context, encrypted_tally_bytes)
    
    # Decrypt it! (TenSEAL automatically finds the secret key inside the context)
    final_tally = encrypted_tally.decrypt()
    return final_tally