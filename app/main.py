from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import Column, String, Integer, Boolean
from sqlalchemy.orm import Session
from pydantic import BaseModel
from passlib.context import CryptContext
from datetime import timedelta
import pyotp
import hashlib
import uuid
import os

import base64

from . import models
from .database import engine, get_db
from . import crypto
from . import blockchain
from . import auth

# Import the new face verification router
try:
    from . import face_verification
except ImportError:
    import sys, os
    sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    import face_verification

# --- NEW MODEL: Unique Registration Tokens ---
class RegistrationToken(models.Base):
    __tablename__ = "registration_tokens"
    id = Column(Integer, primary_key=True, index=True)
    token = Column(String, unique=True, index=True)
    is_used = Column(Boolean, default=False)


models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="STOV System API")

# Register the face verification endpoints
app.include_router(face_verification.router)

# Enable CORS so the React Frontend can communicate with this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password):
    return pwd_context.hash(password)

def verify_password(plain_password, hashed_password):
    #takes the typed password, hashes it, and compares it to the database hash
    return pwd_context.verify(plain_password, hashed_password)

def get_current_admin(current_user: str = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    voter = db.query(models.Voter).filter(models.Voter.voter_id == current_user).first()
    if not voter or not voter.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized to perform this action.")
    return voter.voter_id

# --- PYDANTIC SCHEMAS ---
class VoterCreate(BaseModel):
    voter_id: str
    password: str
    invite_code: str
    
class VoterLogin(BaseModel):
    voter_id: str
    password: str
    
class MFAVerify(BaseModel):
    voter_id: str
    mfa_code: str
    
class ElectionCreate(BaseModel):
    title: str

class CandidateCreate(BaseModel):
    election_id: int
    name: str

class VoteCast(BaseModel):
    election_id: int
    candidate_index: int  # e.g., 0 for Candidate A, 1 for B, 2 for C

class ElectionTally(BaseModel):
    election_id: int
    admin_secret_key: str

class TokenGeneration(BaseModel):
    count: int
    
# --- API ROUTES ---
@app.post("/voters/")
def create_voter(voter: VoterCreate, db: Session = Depends(get_db)):
    # 0. Security Gate: Check for Unique Token OR Admin Master Key
    
    is_new_admin = False
    
    # A. Check if it is the Master Key (For Admin Setup Only)
    if voter.invite_code == "STOV-ADMIN-MASTER-KEY":
        is_new_admin = True # Grant admin privileges
        
    # B. Check if it is a valid One-Time Token
    else:
        token_record = db.query(RegistrationToken).filter(
            RegistrationToken.token == voter.invite_code, 
            RegistrationToken.is_used == False
        ).first()
        
        if not token_record:
            raise HTTPException(status_code=403, detail="Invalid or already used Invite Code.")
        
        # BURN THE TOKEN!
        token_record.is_used = True

    db_voter = db.query(models.Voter).filter(models.Voter.voter_id == voter.voter_id).first()
    if db_voter:
        raise HTTPException(status_code=400, detail="Voter ID already registered")
    
    hashed_pwd = get_password_hash(voter.password)
    
    # 1. Generate a mathematically secure, unique base32 secret for this specific voter
    user_mfa_secret = pyotp.random_base32()
    encrypted_mfa_secret = crypto.encrypt_mfa_secret(user_mfa_secret)
    
    # 2. Save it to the database
    new_voter = models.Voter(
        voter_id=voter.voter_id, 
        password_hash=hashed_pwd, 
        mfa_secret=encrypted_mfa_secret,  # Saving the encrypted secret now!
        is_admin=is_new_admin
    )
    
    db.add(new_voter)
    db.commit()
    db.refresh(new_voter)
    
    # 3. Generate the URI that the React frontend will eventually turn into a QR Code
    totp = pyotp.TOTP(user_mfa_secret)
    provisioning_uri = totp.provisioning_uri(name=voter.voter_id, issuer_name="STOV_Zetech")
    
    # We return the secret and URI so the user can set up their authenticator app
    return {
        "message": "Voter securely registered!", 
        "voter_id": new_voter.voter_id,
        "mfa_setup_key": user_mfa_secret,
        "mfa_qr_uri": provisioning_uri
    }

@app.post("/admin/generate-tokens/")
def generate_registration_tokens(req: TokenGeneration, db: Session = Depends(get_db), current_admin: str = Depends(get_current_admin)):
    """Generates a batch of unique, one-time use tokens for students."""
    tokens = []
    for _ in range(req.count):
        # Generate a short, readable unique code (e.g., STOV-A9F2)
        raw = uuid.uuid4().hex[:6].upper()
        fmt_token = f"STOV-{raw}"
        
        db_token = RegistrationToken(token=fmt_token)
        db.add(db_token)
        tokens.append(fmt_token)
    
    db.commit()
    return {"message": f"Generated {req.count} unique tokens.", "tokens": tokens}

@app.get("/debug/get-unused-token")
def get_unused_token_for_testing(db: Session = Depends(get_db)):
    """HELPER: Returns an unused token so the test script can register."""
    token = db.query(RegistrationToken).filter(RegistrationToken.is_used == False).first()
    return {"token": token.token if token else None}

@app.post("/candidates/")
def add_candidate(candidate: CandidateCreate, db: Session = Depends(get_db), current_admin: str = Depends(get_current_admin)):
    # 1. Check if election exists
    db_election = db.query(models.Election).filter(models.Election.id == candidate.election_id).first()
    if not db_election:
        raise HTTPException(status_code=404, detail="Election not found")
        
    # 1.5. Integrity Check: Cannot add candidates if voting has started
    # Homomorphic encryption requires all vote vectors to be the same size.
    if db.query(models.Ballot).filter(models.Ballot.election_id == candidate.election_id).first():
        raise HTTPException(status_code=400, detail="Cannot add candidates after voting has begun to ensure vector consistency.")

    # 2. Check if candidate already exists in this election
    existing_candidate = db.query(models.Candidate).filter(
        models.Candidate.election_id == candidate.election_id,
        models.Candidate.name == candidate.name
    ).first()
    if existing_candidate:
        raise HTTPException(status_code=400, detail=f"Candidate '{candidate.name}' already exists in this election.")

    # 3. Add the candidate
    new_candidate = models.Candidate(
        election_id=candidate.election_id,
        name=candidate.name
    )
    db.add(new_candidate)
    db.commit()
    db.refresh(new_candidate)
    
    return {
        "message": f"Candidate '{candidate.name}' added to election.",
        "candidate_id": new_candidate.id
    }

@app.get("/candidates/{election_id}")
def list_candidates(election_id: int, db: Session = Depends(get_db)):
    candidates = db.query(models.Candidate).filter(models.Candidate.election_id == election_id).order_by(models.Candidate.id).all()
    return [
        {"candidate_index": i, "name": c.name, "db_id": c.id}
        for i, c in enumerate(candidates)
    ]

@app.get("/elections/")
def list_active_elections(db: Session = Depends(get_db)):
    elections = db.query(models.Election).filter(models.Election.is_active == True).all()
    return [
        {"id": e.id, "title": e.title} for e in elections
    ]

@app.get("/admin/elections/")
def list_all_elections(db: Session = Depends(get_db), current_admin: str = Depends(get_current_admin)):
    elections = db.query(models.Election).order_by(models.Election.id.desc()).all()
    return [
        {"id": e.id, "title": e.title, "is_active": e.is_active} for e in elections
    ]

@app.post("/login/")
def login_voter(voter: VoterLogin, db: Session = Depends(get_db)):
    # 1. Search the database for the voter ID
    db_voter = db.query(models.Voter).filter(models.Voter.voter_id == voter.voter_id).first()
    
    # 2. If the voter ID doesn't exist, throw an error
    if not db_voter:
        raise HTTPException(status_code=401, detail="Invalid Voter ID or Password")
        
    # 3. If the user exists, verify the password
    if not verify_password(voter.password, db_voter.password_hash):
        raise HTTPException(status_code=401, detail="Invalid Voter ID or Password")
        
    # 4. If the passwords match, access is granted! 
    # (Note: In a later step, we will generate a JWT Token and trigger the MFA code here)
    return {
        "message": "Login successful! Identity verified.", 
        "voter_id": db_voter.voter_id,
        "mfa_required": True
    }

@app.post("/verify-mfa/")
def verify_mfa(mfa_data: MFAVerify, db: Session = Depends(get_db)):
    # 1. Fetch the user from the database
    db_voter = db.query(models.Voter).filter(models.Voter.voter_id == mfa_data.voter_id).first()
    
    if not db_voter:
        raise HTTPException(status_code=401, detail="Invalid Voter ID")
    
    # 2. Grab the secret key we saved during registration and decrypt it
    user_secret = crypto.decrypt_mfa_secret(db_voter.mfa_secret)
    
    # 3. Re-create the mathematical TOTP environment for this specific user
    totp = pyotp.TOTP(user_secret)
    
    # 4. Check if the 6-digit code matches the current time window!
    if totp.verify(mfa_data.mfa_code):
        # If true, the code is valid. In the final version, we issue a JWT token here.
        access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = auth.create_access_token(
            data={"sub": db_voter.voter_id, "is_admin": db_voter.is_admin}, expires_delta=access_token_expires
        )
        return {
            "message": "MFA Verified Successfully! Complete Access Granted.", 
            "voter_id": db_voter.voter_id,
            "authenticated": True,
            "access_token": access_token,
            "token_type": "bearer"
        }
    else:
        # If false, the code is wrong or has expired
        raise HTTPException(status_code=401, detail="Invalid or Expired MFA Code")

@app.post("/create-election/")
def create_election(election: ElectionCreate, db: Session = Depends(get_db), current_admin: str = Depends(get_current_admin)):
    # 1. Check if election with same title exists
    if db.query(models.Election).filter(models.Election.title == election.title).first():
        raise HTTPException(status_code=400, detail="Election with this title already exists.")

    # 1. Generate the Homomorphic Encryption keys for this specific election
    pub_context_bytes, sec_context_bytes = crypto.generate_election_keys()
    
    # 2. Convert the public key bytes into a safe text string for PostgreSQL
    pub_key_str = base64.b64encode(pub_context_bytes).decode('utf-8')
    
    # 3. Prepare the Secret Key and create an Encrypted Backup
    sec_key_str = base64.b64encode(sec_context_bytes).decode('utf-8')
    encrypted_backup = crypto.encrypt_mfa_secret(sec_key_str)
    
    # 4. Save the election to the database
    new_election = models.Election(
        title=election.title,
        public_key=pub_key_str,
        secret_key_backup=encrypted_backup,
        is_active=True
    )
    db.add(new_election)
    db.commit()
    db.refresh(new_election)
    
    return {
        "message": "Election Created! Cryptographic keys generated.",
        "election_id": new_election.id,
        "admin_secret_key_DO_NOT_LOSE": sec_key_str
    }

@app.post("/elections/{election_id}/recover-key")
def recover_election_key(election_id: int, db: Session = Depends(get_db), current_admin: str = Depends(get_current_admin)):
    db_election = db.query(models.Election).filter(models.Election.id == election_id).first()
    if not db_election:
        raise HTTPException(status_code=404, detail="Election not found.")
    
    if not db_election.secret_key_backup:
        raise HTTPException(status_code=404, detail="No backup key found for this election.")
        
    try:
        decrypted_key = crypto.decrypt_mfa_secret(db_election.secret_key_backup)
        return {"admin_secret_key": decrypted_key}
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to decrypt backup key.")

@app.put("/elections/{election_id}/close")
def close_election(election_id: int, db: Session = Depends(get_db), current_admin: str = Depends(get_current_admin)):
    db_election = db.query(models.Election).filter(models.Election.id == election_id).first()
    if not db_election:
        raise HTTPException(status_code=404, detail="Election not found.")
    
    if not db_election.is_active:
        raise HTTPException(status_code=400, detail="Election is already closed.")

    db_election.is_active = False
    db.commit()
    
    return {"message": f"Election '{db_election.title}' has been closed. No more votes will be accepted."}


@app.post("/cast-vote/")
def cast_vote(vote: VoteCast, db: Session = Depends(get_db), current_voter: str = Depends(auth.get_current_user)):
    # 1. Security Check: Does the voter exist?
    db_voter = db.query(models.Voter).filter(models.Voter.voter_id == current_voter).first()
    if not db_voter:
        raise HTTPException(status_code=400, detail="Voter ID not found.")
        
    # 2. Security Check: Has this voter ALREADY voted in THIS specific election?
    existing_record = db.query(models.VoteRecord).filter(
        models.VoteRecord.voter_id == current_voter,
        models.VoteRecord.election_id == vote.election_id
    ).first()
    
    if existing_record:
        raise HTTPException(status_code=400, detail="Double Voting Prevented: You have already voted in this election.")
        
    # 3. Security Check: Does the election exist?
    db_election = db.query(models.Election).filter(models.Election.id == vote.election_id).first()
    if not db_election or not db_election.is_active:
        raise HTTPException(status_code=400, detail="Election is invalid or inactive.")
        
    # 4. Fetch candidates to determine vector size and validate index
    # We order by ID to ensure deterministic index mapping (0 -> First added, 1 -> Second added...)
    candidates = db.query(models.Candidate).filter(models.Candidate.election_id == vote.election_id).order_by(models.Candidate.id).all()
    num_candidates = len(candidates)
    
    if num_candidates == 0:
        raise HTTPException(status_code=400, detail="No candidates found for this election.")

    if 0 <= vote.candidate_index < num_candidates:
        # Create a zero vector of the correct size
        vote_array = [0] * num_candidates
        vote_array[vote.candidate_index] = 1 
    else:
        raise HTTPException(status_code=400, detail="Invalid candidate selection.")
        
    # 5. ENCRYPT THE VOTE!
    pub_context_bytes = base64.b64decode(db_election.public_key)
    encrypted_bytes = crypto.encrypt_vote(pub_context_bytes, vote_array)
    encrypted_str = base64.b64encode(encrypted_bytes).decode('utf-8')
    
    # 6. Generate a unique Receipt ID and Digital Fingerprint
    receipt_id = uuid.uuid4().hex
    # SECURITY UPGRADE: Bind the Election ID to the fingerprint.
    # This ensures a vote cannot be moved to a different election in the DB without breaking the audit.
    fingerprint_payload = f"{db_election.id}:{encrypted_str}"
    vote_fingerprint = hashlib.sha256(fingerprint_payload.encode('utf-8')).hexdigest()
    
    # 7. SAVE THE FINGERPRINT TO THE BLOCKCHAIN!
    config = db.query(models.SystemConfig).filter(models.SystemConfig.key == "contract_address").first()
    if not config or not config.value:
        raise HTTPException(status_code=400, detail="Smart Contract not deployed. Please call /deploy-ledger/ first.")
        
    contract_address = config.value
    real_tx_hash = blockchain.store_ballot_on_chain(contract_address, receipt_id, vote_fingerprint)
    
    # 8. Save the massive encrypted ballot to PostgreSQL
    new_ballot = models.Ballot(
        election_id=db_election.id,
        encrypted_vote_data=encrypted_str,
        transaction_hash=real_tx_hash,
        receipt_id=receipt_id
    )
    db.add(new_ballot)
    
    # 9. Record that the voter participated in this specific election
    new_participation_record = models.VoteRecord(
        voter_id=current_voter,
        election_id=db_election.id
    )
    db.add(new_participation_record)
    
    db.commit()
    
    return {
        "message": "Vote successfully encrypted and anchored to the Blockchain!",
        "receipt_id": receipt_id,
        "blockchain_transaction_hash": real_tx_hash,
        "digital_fingerprint": vote_fingerprint
    }

@app.get("/deploy-ledger/")
def test_blockchain_deployment(db: Session = Depends(get_db), current_admin: str = Depends(get_current_admin)):
    # 1. Safety Check: Don't overwrite an existing ledger
    existing_config = db.query(models.SystemConfig).filter(models.SystemConfig.key == "contract_address").first()
    if existing_config and existing_config.value:
        raise HTTPException(status_code=400, detail="Ledger already deployed. Redeploying would break the audit trail for existing votes.")

    # Call the deploy function we just wrote
    address = blockchain.deploy_contract()
    
    if "Error" in address:
        raise HTTPException(status_code=500, detail="Failed to connect to Ganache")
        
    # Update the database so other endpoints use the new address
    config = db.query(models.SystemConfig).filter(models.SystemConfig.key == "contract_address").first()
    if config:
        config.value = address
    else:
        new_config = models.SystemConfig(key="contract_address", value=address)
        db.add(new_config)
    db.commit()
    
    return {
        "message": "Smart Contract Successfully Deployed to DLT!",
        "network": "Local Ganache Ethereum",
        "contract_address": address
    }

@app.post("/tally-election/")
def tally_election(tally_req: ElectionTally, db: Session = Depends(get_db), current_admin: str = Depends(get_current_admin)):
    # 1. Security Check: Does the election exist?
    db_election = db.query(models.Election).filter(models.Election.id == tally_req.election_id).first()
    if not db_election:
        raise HTTPException(status_code=404, detail="Election not found.")
        
    # 2. Fetch all the encrypted ballots for this election from PostgreSQL
    ballots = db.query(models.Ballot).filter(models.Ballot.election_id == tally_req.election_id).all()
    if not ballots:
        return {"message": "No votes have been cast yet.", "results": []}
        
   # 3. Decode the Public Key and Secret Key back into raw bytes
    pub_context_bytes = base64.b64decode(db_election.public_key)
    try:
        sec_context_bytes = base64.b64decode(tally_req.admin_secret_key)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid secret key format.")

    # 4. THE MAGIC: Process the election in a memory-efficient way!
    # Create a generator expression instead of a full list in memory
    encrypted_bytes_generator = (base64.b64decode(b.encrypted_vote_data) for b in ballots)
    
    try:
        master_encrypted_tally = crypto.tally_all_encrypted_votes(
            pub_context_bytes, 
            encrypted_bytes_generator
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing ballots: {str(e)}")
    
    if master_encrypted_tally is None:
        return {"message": "No valid votes to tally.", "results": {}}
        
    # 5. THE REVEAL: Decrypt the final master tally
    try:
        final_results = crypto.decrypt_tally(sec_context_bytes, master_encrypted_tally)
    except Exception:
        raise HTTPException(status_code=400, detail="Decryption failed. Data corrupted.")
        
    # 6. BFV strictly produces integers, so we can use the results directly
    clean_results = final_results
    
    # 7. Map results to candidate names
    candidates = db.query(models.Candidate).filter(models.Candidate.election_id == tally_req.election_id).order_by(models.Candidate.id).all()
    
    results_dict = {}
    for i, candidate in enumerate(candidates):
        if i < len(clean_results):
            results_dict[candidate.name] = clean_results[i]
        else:
            results_dict[candidate.name] = 0

    return {
        "message": "Election successfully tallied using Homomorphic Encryption!",
        "total_votes_counted": len(ballots),
        "official_results": results_dict
    }

@app.get("/audit-election/{election_id}")
def audit_election(election_id: int, db: Session = Depends(get_db)):
    config = db.query(models.SystemConfig).filter(models.SystemConfig.key == "contract_address").first()
    if not config or not config.value:
        raise HTTPException(status_code=400, detail="Smart Contract not deployed. Please call /deploy-ledger/ first.")
        
    contract_address = config.value

    # 1. Fetch the Guestbook (VoteRecords) and the actual Ballots
    vote_records = db.query(models.VoteRecord).filter(models.VoteRecord.election_id == election_id).all()
    ballots = db.query(models.Ballot).filter(models.Ballot.election_id == election_id).all()

    total_voters = len(vote_records)
    total_ballots = len(ballots)

    issues = []

    # 2. AUDIT TRAP 1: The Discrepancy Check
    if total_voters != total_ballots:
        issues.append(f"COUNT MISMATCH: {total_voters} voters signed in, but {total_ballots} ballots are in the database. A vote was deleted or added!")

    # 3. AUDIT TRAP 2: Cryptographic & Blockchain Verification
    for ballot in ballots:
        # Recalculate the fingerprint of the data currently sitting in PostgreSQL
        # We must use the same format: "ELECTION_ID:DATA"
        fingerprint_payload = f"{ballot.election_id}:{ballot.encrypted_vote_data}"
        current_fingerprint = hashlib.sha256(fingerprint_payload.encode('utf-8')).hexdigest()
        
        # Ask the Ethereum Virtual Machine if this transaction actually exists
        try:
            tx_receipt = blockchain.w3.eth.get_transaction_receipt(ballot.transaction_hash)
            
            # Status 1 means the transaction was successful and permanently mined
            if tx_receipt.status != 1:
                issues.append(f"BLOCKCHAIN ERROR: Transaction {ballot.transaction_hash} failed on the ledger.")
                
            # Verify the data stored on-chain matches the database fingerprint
            if ballot.receipt_id:
                on_chain_fingerprint = blockchain.verify_vote_on_chain(contract_address, ballot.receipt_id)
                if on_chain_fingerprint != current_fingerprint:
                    issues.append(f"TAMPERING DETECTED: Database fingerprint for {ballot.receipt_id} does not match Blockchain record!")
            else:
                issues.append(f"DATA INTEGRITY ERROR: Ballot {ballot.id} missing receipt_id.")

        except Exception as e:
            # If the blockchain has no record of this hash, the database vote is completely fake
            issues.append(f"FORGERY DETECTED: Ballot transaction {ballot.transaction_hash} does not exist on the blockchain! Error: {str(e)}")

    # 4. AUDIT TRAP 3: Ghost Vote Check (Blockchain -> DB)
    # Ensure every vote on the ledger corresponds to a ballot in the DB.
    try:
        chain_events = blockchain.get_all_vote_events(contract_address)
        
        # FIX: Check against ALL ballots in the system, not just this election's.
        # This prevents votes from other elections being flagged as ghosts.
        all_db_receipts = db.query(models.Ballot.receipt_id).all()
        all_db_receipt_ids = {r[0] for r in all_db_receipts}
        
        for event in chain_events:
            if event['receipt_id'] not in all_db_receipt_ids:
                issues.append(f"GHOST VOTE DETECTED: Blockchain has receipt {event['receipt_id']} (Tx: {event['transaction_hash']}) but it is missing from the database!")
    except Exception as e:
        issues.append(f"COULD NOT FETCH EVENTS: {str(e)}")

    # 5. The Final Verdict
    if len(issues) > 0:
        return {
            "audit_status": "COMPROMISED",
            "message": "CRITICAL ALERT: The election data has been tampered with.",
            "issues_found": issues
        }

    return {
        "audit_status": "VERIFIED",
        "message": "Audit passed. All database records match and all blockchain transactions are mathematically authentic.",
        "total_valid_votes": total_ballots
    }