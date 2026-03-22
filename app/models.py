from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func
from .database import Base

class Voter(Base):
    __tablename__ = "voters"

    id = Column(Integer, primary_key=True, index=True)
    voter_id = Column(String, unique=True, index=True) # e.g., BSCIT-05-0828/2023
    name = Column(String, nullable=True)
    email = Column(String, nullable=True)
    password_hash = Column(String)
    mfa_secret = Column(String) # For the TOTP/Authenticator app
    is_admin = Column(Boolean, default=False)
    face_encoding = Column(String, nullable=True) # Stores the 128D face vector as JSON
    avatar = Column(String, nullable=True) # Stores the base64 profile photo

class Election(Base):
    __tablename__ = "elections"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String)
    start_time = Column(DateTime, default=func.now())
    end_time = Column(DateTime)
    public_key = Column(String) # The key used for Homomorphic Encryption
    secret_key_backup = Column(String, nullable=True) # Encrypted backup of the admin key
    is_active = Column(Boolean, default=True)
    final_results = Column(String, nullable=True) # Stores JSON string of the official tally

class Candidate(Base):
    __tablename__ = "candidates"

    id = Column(Integer, primary_key=True, index=True)
    election_id = Column(Integer, ForeignKey("elections.id"))
    name = Column(String)

class Ballot(Base):
    __tablename__ = "ballots"

    id = Column(Integer, primary_key=True, index=True)
    election_id = Column(Integer, ForeignKey("elections.id"))
    encrypted_vote_data = Column(String) # The TenSEAL ciphertext goes here!
    timestamp = Column(DateTime, default=func.now())
    transaction_hash = Column(String, unique=True) # The receipt from the Blockchain
    receipt_id = Column(String, unique=True, index=True)

class VoteRecord(Base):
    __tablename__ = "vote_records"

    id = Column(Integer, primary_key=True, index=True)
    voter_id = Column(String, index=True)
    election_id = Column(Integer, index=True)
    
class SystemConfig(Base):
    __tablename__ = "system_config"

    key = Column(String, primary_key=True, index=True)
    value = Column(String)
