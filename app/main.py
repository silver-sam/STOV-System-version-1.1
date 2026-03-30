from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import Column, String, Integer, Boolean
from sqlalchemy.orm import Session
from pydantic import BaseModel
from passlib.context import CryptContext
from datetime import timedelta, datetime, timezone
from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType
from pydantic import EmailStr
import pyotp
import hashlib
import uuid
import os
import secrets

import base64
import numpy as np
import cv2
import face_recognition
import math
import json

from . import models
from .database import engine, get_db
from . import crypto
from . import blockchain
from . import auth
from . import utils

# Import the new face verification router
try:
    from . import face_verification
except ImportError:
    import sys, os
    sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    import app.face_verification as face_verification

# --- FASTAPI-MAIL CONFIG ---
# It's highly recommended to use environment variables for this in production.
# For Gmail, you may need to generate an "App Password".
conf = ConnectionConfig(
    MAIL_USERNAME = os.getenv("MAIL_USERNAME", "your-email@example.com"),
    MAIL_PASSWORD = os.getenv("MAIL_PASSWORD", "your-email-password"),
    MAIL_FROM = EmailStr(os.getenv("MAIL_FROM", "AegisElect <your-email@example.com>")),
    MAIL_PORT = int(os.getenv("MAIL_PORT", 587)),
    MAIL_SERVER = os.getenv("MAIL_SERVER", "smtp.gmail.com"),
    MAIL_STARTTLS = os.getenv("MAIL_STARTTLS", "True").lower() in ('true', '1', 't'),
    MAIL_SSL_TLS = os.getenv("MAIL_SSL_TLS", "False").lower() in ('true', '1', 't'),
    USE_CREDENTIALS = os.getenv("USE_CREDENTIALS", "True").lower() in ('true', '1', 't'),
    VALIDATE_CERTS = os.getenv("VALIDATE_CERTS", "True").lower() in ('true', '1', 't')
)

# --- NEW MODEL: Unique Registration Tokens ---
class RegistrationToken(models.Base):
    __tablename__ = "registration_tokens"
    id = Column(Integer, primary_key=True, index=True)
    token = Column(String, unique=True, index=True)
    is_used = Column(Boolean, default=False)


limiter = Limiter(key_func=get_remote_address)
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="AegisElect API")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


os.makedirs("uploads/avatars", exist_ok=True)
os.makedirs("uploads/candidates", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

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
    name: str
    email: str
    voter_id: str
    password: str
    face_image: str | None = None
    admin_key: str | None = None
    
class VoterLogin(BaseModel):
    voter_id: str
    password: str
    
class MFAVerify(BaseModel):
    voter_id: str
    mfa_code: str
    
class ElectionCreate(BaseModel):
    title: str
    start_time: datetime | None = None
    end_time: datetime | None = None
    is_exclusive: bool = False

class CandidateCreate(BaseModel):
    election_id: int
    name: str
    party: str | None = None
    photo: str | None = None

class VoteCast(BaseModel):
    election_id: int
    candidate_index: int  # e.g., 0 for Candidate A, 1 for B, 2 for C

class ElectionTally(BaseModel):
    election_id: int

class TokenGeneration(BaseModel):
    count: int
    
class FaceDetectRequest(BaseModel):
    image: str

class AvatarUpdate(BaseModel):
    avatar: str

class TicketCreate(BaseModel):
    voter_id: str
    message: str

class PasswordResetRequest(BaseModel):
    voter_id: str
    email: str
    face_image: str

class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str

class MFAResetRequest(BaseModel):
    voter_id: str

# --- API ROUTES ---
@app.post("/detect-face/")
@limiter.limit("60/minute")
def detect_face_presence(request: FaceDetectRequest, req: Request):
    """Fast endpoint used purely for real-time UI feedback (bounding box check only)."""
    try:
        
        try:
            img = utils.decode_base64_image(request.image)
            if img is None:
                return {"detected": False, "detail": "Invalid image format."}
        except ValueError:
            return {"detected": False, "detail": "Invalid image format."}
            
        rgb_img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        # Use face_locations() which is exponentially faster than face_encodings()
        face_locations = face_recognition.face_locations(rgb_img)
        
        if len(face_locations) == 1:
            # Liveness Detection: Check Eye Aspect Ratio (Blink)
            is_blinking = False
            landmarks = face_recognition.face_landmarks(rgb_img, face_locations)
            if landmarks:
                def eye_aspect_ratio(eye):
                    A = math.hypot(eye[1][0] - eye[5][0], eye[1][1] - eye[5][1])
                    B = math.hypot(eye[2][0] - eye[4][0], eye[2][1] - eye[4][1])
                    C = math.hypot(eye[0][0] - eye[3][0], eye[0][1] - eye[3][1])
                    return (A + B) / (2.0 * C) if C != 0 else 0
                
                left_eye = landmarks[0].get('left_eye')
                right_eye = landmarks[0].get('right_eye')
                if left_eye and right_eye:
                    ear = (eye_aspect_ratio(left_eye) + eye_aspect_ratio(right_eye)) / 2.0
                    if ear < 0.28: # Increased threshold to make blink detection much easier
                        is_blinking = True

            return {"detected": True, "blinking": is_blinking, "detail": "Face detected! Please blink once to verify liveness."}
        elif len(face_locations) > 1:
            return {"detected": False, "blinking": False, "detail": "Multiple faces detected. Please ensure only you are in the frame."}
        else:
            return {"detected": False, "blinking": False, "detail": "No face detected. Please face the camera."}
    except Exception as e:
        return {"detected": False, "blinking": False, "detail": "Scanning stream..."}

@app.post("/voters/")
@limiter.limit("5/hour")
def create_voter(voter: VoterCreate, request: Request, db: Session = Depends(get_db)):
    is_new_admin = False
    
    # Admin Master Key Check (Bypasses Face Requirement for Admins)
    admin_master_key = os.getenv("ADMIN_MASTER_KEY")
    if voter.admin_key:
        if not admin_master_key:
            admin_master_key = "AEGISELECT-ADMIN-MASTER-KEY"
        if voter.admin_key == admin_master_key:
            # Security Check: Only allow the master key if NO admin exists yet
            if db.query(models.Voter).filter(models.Voter.is_admin == True).first():
                raise HTTPException(status_code=403, detail="Administrator already exists. The Master Key is permanently disabled.")
            is_new_admin = True # Grant admin privileges

    db_voter = db.query(models.Voter).filter(models.Voter.voter_id == voter.voter_id).first()
    if db_voter:
        raise HTTPException(status_code=400, detail="Voter ID already registered")

    # 1. Process Face Verification for ALL users
    face_encoding_str = None
    if not voter.face_image:
        raise HTTPException(status_code=400, detail="Face image is required for registration.")
        
    try:
        
        img = utils.decode_base64_image(voter.face_image)
        if img is None:
            raise HTTPException(status_code=400, detail="Invalid image data.")
            
        rgb_img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        face_encodings = face_recognition.face_encodings(rgb_img)
        
        if len(face_encodings) == 0:
            raise HTTPException(status_code=400, detail="No face detected in registration image. Please ensure good lighting.")
        elif len(face_encodings) > 1:
            raise HTTPException(status_code=400, detail="Multiple faces detected. Please ensure only you are in the frame.")
            
        captured_encoding = face_encodings[0]

        # 1.5 Prevent Sybil Attacks scoped to role (One Face = One Voter, One Face = One Admin)
        existing_voters = db.query(models.Voter).filter(
            models.Voter.face_encoding.isnot(None),
            models.Voter.is_admin == is_new_admin
        ).all()
        
        for existing_voter in existing_voters:
            reference_encoding = np.array(json.loads(existing_voter.face_encoding))
            distances = face_recognition.face_distance([reference_encoding], captured_encoding)
            if distances[0] <= 0.50: # Relaxed slightly to prevent blocking legitimate but similar faces
                role_name = "Admin" if is_new_admin else "Voter"
                raise HTTPException(status_code=400, detail=f"Registration denied: Face matches an existing {role_name} account (Math Distance: {distances[0]:.3f}).")
            
        # Save the math vector as a string array for the Database
        face_encoding_str = json.dumps(captured_encoding.tolist())
        
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"Error processing face image: {str(e)}")
    
    hashed_pwd = get_password_hash(voter.password)
    
    # 1. Generate a mathematically secure, unique base32 secret for this specific voter
    user_mfa_secret = pyotp.random_base32()
    encrypted_mfa_secret = crypto.encrypt_mfa_secret(user_mfa_secret)
    
    # 2. Save it to the database
    new_voter = models.Voter(
        name=voter.name,
        email=voter.email,
        voter_id=voter.voter_id, 
        password_hash=hashed_pwd, 
        mfa_secret=encrypted_mfa_secret,  # Saving the encrypted secret now!
        is_admin=is_new_admin,
        face_encoding=face_encoding_str
    )
    
    db.add(new_voter)
    db.commit()
    db.refresh(new_voter)
    
    # 3. Generate the URI that the React frontend will eventually turn into a QR Code
    totp = pyotp.TOTP(user_mfa_secret)
    provisioning_uri = totp.provisioning_uri(name=voter.voter_id, issuer_name="AegisElect")
    
    # We return the secret and URI so the user can set up their authenticator app
    return {
        "message": "Voter securely registered!", 
        "voter_id": new_voter.voter_id,
        "mfa_setup_key": user_mfa_secret,
        "mfa_qr_uri": provisioning_uri
    }

@app.get("/debug/clear-voters")
def clear_all_voters(db: Session = Depends(get_db)):
    """HELPER: Wipes all voters from the database to clear out ghost testing records."""
    db.query(models.VoteRecord).delete()
    db.query(models.Voter).delete()
    db.commit()
    import shutil
    try:
        shutil.rmtree("uploads/avatars")
        os.makedirs("uploads/avatars", exist_ok=True)
    except:
        pass
    return {"message": "All voters and biometric data have been completely wiped! You can start fresh."}

@app.post("/admin/generate-tokens/")
def generate_registration_tokens(req: TokenGeneration, db: Session = Depends(get_db), current_admin: str = Depends(get_current_admin)):
    """Generates a batch of unique, one-time use tokens for students."""
    tokens = []
    for _ in range(req.count):
        # Generate a short, readable unique code (e.g., AEGIS-A9F2)
        raw = uuid.uuid4().hex[:6].upper()
        fmt_token = f"AEGIS-{raw}"
        
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
def add_candidate(candidate: CandidateCreate, request: Request, db: Session = Depends(get_db), current_admin: str = Depends(get_current_admin)):
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

    photo_url = candidate.photo
    if photo_url and photo_url.startswith("data:image"):
        try:
            header, encoded = photo_url.split(",", 1)
            ext = utils.validate_image_extension(header)
            filename = f"cand_{uuid.uuid4().hex[:8]}.{ext}"
            filepath = os.path.join("uploads", "candidates", filename)
            with open(filepath, "wb") as f:
                f.write(base64.b64decode(encoded))
            photo_url = f"{request.base_url}uploads/candidates/{filename}"
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid photo format: {str(e)}")

    # 3. Add the candidate
    new_candidate = models.Candidate(
        election_id=candidate.election_id,
        name=candidate.name,
        party=candidate.party,
        photo=photo_url
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
        {"candidate_index": i, "name": c.name, "party": c.party, "photo": c.photo, "db_id": c.id}
        for i, c in enumerate(candidates)
    ]

@app.delete("/candidates/{candidate_id}")
def remove_candidate(candidate_id: int, db: Session = Depends(get_db), current_admin: str = Depends(get_current_admin)):
    db_candidate = db.query(models.Candidate).filter(models.Candidate.id == candidate_id).first()
    if not db_candidate:
        raise HTTPException(status_code=404, detail="Candidate not found.")
        
    if db.query(models.Ballot).filter(models.Ballot.election_id == db_candidate.election_id).first():
        raise HTTPException(status_code=400, detail="Cannot remove a candidate after voting has begun to ensure vector consistency.")
        
    photo_url = db_candidate.photo
    db.delete(db_candidate)
    db.commit()
    
    if photo_url and "/uploads/candidates/" in photo_url:
        try:
            filename = photo_url.split("/")[-1]
            filepath = os.path.join("uploads", "candidates", filename)
            if os.path.exists(filepath):
                os.remove(filepath)
        except:
            pass
            
    return {"message": f"Candidate '{db_candidate.name}' removed successfully."}

@app.get("/elections/")
def list_active_elections(db: Session = Depends(get_db), current_voter: str = Depends(auth.get_current_user)):
    elections = db.query(models.Election).filter(models.Election.is_active == True).all()
    
    # Fetch all election IDs this voter has participated in
    voted_records = db.query(models.VoteRecord.election_id).filter(models.VoteRecord.voter_id == current_voter).all()
    voted_election_ids = {r[0] for r in voted_records}
    
    # Check if they have participated in ANY exclusive election
    has_exclusive_vote = any(e.is_exclusive for e in elections if e.id in voted_election_ids)

    return [
        {
            "id": e.id, 
            "title": e.title,
            "start_time": e.start_time.isoformat() if e.start_time else None,
            "end_time": e.end_time.isoformat() if e.end_time else None,
            "is_exclusive": e.is_exclusive,
            "has_voted": e.id in voted_election_ids,
            "is_locked": e.is_exclusive and has_exclusive_vote and e.id not in voted_election_ids
        } for e in elections
    ]

@app.get("/admin/elections/")
def list_all_elections(db: Session = Depends(get_db), current_admin: str = Depends(get_current_admin)):
    elections = db.query(models.Election).order_by(models.Election.id.desc()).all()
    total_voters = db.query(models.Voter).filter(models.Voter.is_admin == False).count()
    
    results = []
    for e in elections:
        vote_count = db.query(models.VoteRecord).filter(models.VoteRecord.election_id == e.id).count()
        results.append({
            "id": e.id, "title": e.title, "is_active": e.is_active, "status": e.status,
            "start_time": e.start_time.isoformat() if e.start_time else None,
            "end_time": e.end_time.isoformat() if e.end_time else None,
            "is_exclusive": e.is_exclusive,
            "vote_count": vote_count,
            "total_eligible": total_voters
        })
    return results

@app.get("/admin/voters-export/")
def export_voters_csv(db: Session = Depends(get_db), current_admin: str = Depends(get_current_admin)):
    voters = db.query(models.Voter).filter(models.Voter.is_admin == False).order_by(models.Voter.id.desc()).all()
    return [
        {
            "voter_id": v.voter_id,
            "name": v.name or "Unknown",
            "email": v.email or "Unknown"
        } for v in voters
    ]

@app.delete("/admin/voters/{voter_id:path}")
def delete_voter(voter_id: str, db: Session = Depends(get_db), current_admin: str = Depends(get_current_admin)):
    db_voter = db.query(models.Voter).filter(models.Voter.voter_id == voter_id).first()
    if not db_voter:
        raise HTTPException(status_code=404, detail=f"Voter '{voter_id}' not found.")
    
    if db_voter.is_admin:
        raise HTTPException(status_code=403, detail="Cannot delete administrator accounts.")
        
    avatar_url = db_voter.avatar
    db.delete(db_voter)
    db.commit()
    
    if avatar_url and "/uploads/avatars/" in avatar_url:
        try:
            filename = avatar_url.split("/")[-1]
            filepath = os.path.join("uploads", "avatars", filename)
            if os.path.exists(filepath):
                os.remove(filepath)
        except:
            pass
            
    return {"message": f"Account for '{voter_id}' deleted successfully. They can now re-register."}

@app.post("/support-tickets/")
@limiter.limit("5/hour")
def create_support_ticket(ticket: TicketCreate, request: Request, db: Session = Depends(get_db)):
    # Check if the Voter ID exists
    db_voter = db.query(models.Voter).filter(models.Voter.voter_id == ticket.voter_id).first()
    if not db_voter:
        raise HTTPException(status_code=404, detail="Voter ID not found. Please check and try again.")
        
    if not db_voter.face_encoding:
        raise HTTPException(status_code=400, detail="This account does not have a face model and cannot be reset this way.")

    # --- FACE VERIFICATION ---
    try:
        img = utils.decode_base64_image(ticket.face_image)
        if img is None:
            raise HTTPException(status_code=400, detail="Invalid image data provided for verification.")
            
        rgb_img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        face_encodings = face_recognition.face_encodings(rgb_img)
        
        if len(face_encodings) != 1:
            raise HTTPException(status_code=400, detail="Could not clearly detect one face for verification.")
            
        captured_encoding = face_encodings[0]
        reference_encoding = np.array(json.loads(db_voter.face_encoding))
        
        distances = face_recognition.face_distance([reference_encoding], captured_encoding)
        if distances[0] > 0.60: # Relaxed to industry standard to accommodate lighting/camera changes
            raise HTTPException(status_code=403, detail=f"Face verification failed. You are not authorized to reset this account.")

    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail="An error occurred during face verification.")

    new_ticket = models.SupportTicket(voter_id=ticket.voter_id, message=ticket.message)
    db.add(new_ticket)
    db.commit()
    return {"message": "Support ticket submitted successfully."}

@app.get("/admin/support-tickets/")
def get_support_tickets(db: Session = Depends(get_db), current_admin: str = Depends(get_current_admin)):
    tickets = db.query(models.SupportTicket).order_by(models.SupportTicket.status.asc(), models.SupportTicket.created_at.desc()).all()
    return [
        {
            "id": t.id, "voter_id": t.voter_id, "message": t.message, "status": t.status,
            "created_at": t.created_at.isoformat() if t.created_at else None
        } for t in tickets
    ]

@app.put("/admin/support-tickets/{ticket_id}/resolve")
def resolve_support_ticket(ticket_id: int, db: Session = Depends(get_db), current_admin: str = Depends(get_current_admin)):
    ticket = db.query(models.SupportTicket).filter(models.SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found.")
    ticket.status = "resolved"
    db.commit()
    return {"message": "Ticket marked as resolved."}

@app.post("/forgot-password/")
@limiter.limit("5/hour")
async def forgot_password(req: PasswordResetRequest, request: Request, db: Session = Depends(get_db)):
    """Step 1 of Automated Reset: Claim Identity and Verify Face."""
    db_voter = db.query(models.Voter).filter(
        models.Voter.voter_id == req.voter_id,
        models.Voter.email == req.email
    ).first()
    
    # Generic message to prevent bad actors from guessing valid email/ID combos.
    # We will send the email only if the user exists, but the response is the same.
    success_message = "If an account with that Voter ID and Email exists, and the face matches, a password reset link has been sent."

    if not db_voter:
        return {"message": success_message}
        
    if not db_voter.face_encoding:
        return {"message": success_message}

    # --- FACE VERIFICATION ---
    try:
        img = utils.decode_base64_image(req.face_image)
        if img is None:
            raise HTTPException(status_code=400, detail="Invalid image data.")
            
        rgb_img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        face_encodings = face_recognition.face_encodings(rgb_img)
        
        if len(face_encodings) != 1:
            raise HTTPException(status_code=400, detail="Could not clearly detect exactly one face.")
            
        captured_encoding = face_encodings[0]
        reference_encoding = np.array(json.loads(db_voter.face_encoding))
        
        distances = face_recognition.face_distance([reference_encoding], captured_encoding)
        if distances[0] > 0.60: # Relaxed to industry standard
            # Face doesn't match, but we still return the generic success message for security.
            return {"message": success_message}
            
    except Exception as e:
        return {"message": success_message}

    # --- GENERATE SECURE TOKEN ---
    reset_token = secrets.token_urlsafe(32)
    expires = datetime.utcnow() + timedelta(minutes=15)
    
    db_token = models.PasswordResetToken(
        voter_id=db_voter.voter_id,
        token=reset_token,
        expires_at=expires
    )
    db.add(db_token)
    db.commit()
    
    # --- SEND EMAIL ---
    # In production, get this from your config. For development, localhost:5173 is common for Vite.
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173") 
    reset_link = f"{frontend_url}/forgot-password?token={reset_token}"

    html_body = f"""
    <p>Hello {db_voter.name},</p>
    <p>You requested a password reset for your AegisElect account.</p>
    <p>Please click the link below to set a new password. This link is valid for 15 minutes.</p>
    <p><a href="{reset_link}" style="background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a></p>
    <p>If you did not request this, please ignore this email.</p>
    """

    message = MessageSchema(
        subject="AegisElect Password Reset Request",
        recipients=[req.email],
        body=html_body,
        subtype=MessageType.html
    )
    fm = FastMail(conf)
    await fm.send_message(message)
    
    return {"message": success_message}

@app.post("/reset-password/")
@limiter.limit("5/hour")
def reset_password(req: PasswordResetConfirm, request: Request, db: Session = Depends(get_db)):
    """Step 2 of Automated Reset: Submit New Password with Valid Token."""
    db_token = db.query(models.PasswordResetToken).filter(
        models.PasswordResetToken.token == req.token,
        models.PasswordResetToken.is_used == False
    ).first()

    if not db_token:
        raise HTTPException(status_code=400, detail="Invalid or already used token.")
        
    if datetime.utcnow() > db_token.expires_at:
        raise HTTPException(status_code=400, detail="This password reset token has expired.")
        
    db_voter = db.query(models.Voter).filter(models.Voter.voter_id == db_token.voter_id).first()
    if not db_voter:
        raise HTTPException(status_code=404, detail="User not found.")

    # Update the password and burn the token
    db_voter.password_hash = get_password_hash(req.new_password)
    db_token.is_used = True
    db.commit()

    return {"message": "Password has been successfully reset. You can now log in."}

@app.post("/admin/reset-mfa/")
def reset_user_mfa(req: MFAResetRequest, db: Session = Depends(get_db), current_admin: str = Depends(get_current_admin)):
    """Admin Tool: Regenerate a user's MFA secret if they lost their phone (via Support Ticket)."""
    db_voter = db.query(models.Voter).filter(models.Voter.voter_id == req.voter_id).first()
    if not db_voter:
        raise HTTPException(status_code=404, detail="Voter not found.")
        
    new_mfa_secret = pyotp.random_base32()
    encrypted_secret = crypto.encrypt_mfa_secret(new_mfa_secret)
    
    db_voter.mfa_secret = encrypted_secret
    db.commit()
    
    totp = pyotp.TOTP(new_mfa_secret)
    provisioning_uri = totp.provisioning_uri(name=db_voter.voter_id, issuer_name="AegisElect")
    
    return {
        "message": f"MFA securely reset for {req.voter_id}.",
        "new_mfa_setup_key": new_mfa_secret,
        "new_mfa_qr_uri": provisioning_uri
    }

@app.get("/admin/analytics/")
def get_analytics(db: Session = Depends(get_db), current_admin: str = Depends(get_current_admin)):
    total_voters = db.query(models.Voter).filter(models.Voter.is_admin == False).count()
    voters_who_voted = db.query(models.VoteRecord.voter_id).distinct().count()
    total_elections = db.query(models.Election).count()
    total_ballots = db.query(models.Ballot).count()
    pending_tickets = db.query(models.SupportTicket).filter(models.SupportTicket.status == "pending").count()
    
    return {
        "total_registered_voters": total_voters,
        "voters_who_voted": voters_who_voted,
        "total_elections": total_elections,
        "total_ballots_cast": total_ballots,
        "pending_tickets": pending_tickets
    }

@app.post("/login/")
@limiter.limit("10/minute")
def login_voter(voter: VoterLogin, request: Request, db: Session = Depends(get_db)):
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
@limiter.limit("10/minute")
def verify_mfa(mfa_data: MFAVerify, request: Request, db: Session = Depends(get_db)):
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

    # AUTO-DEPLOY LEDGER ON FIRST ELECTION
    config = db.query(models.SystemConfig).filter(models.SystemConfig.key == "contract_address").first()
    if not config or not config.value:
        address = blockchain.deploy_contract()
        if "Error" in address:
            raise HTTPException(status_code=500, detail="Failed to connect to local Ganache network to deploy ledger.")
        if config:
            config.value = address
        else:
            new_config = models.SystemConfig(key="contract_address", value=address)
            db.add(new_config)

    # 1. Generate the Homomorphic Encryption keys for this specific election
    pub_context_bytes, sec_context_bytes = crypto.generate_election_keys()
    
    # 2. Convert the public key bytes into a safe text string for PostgreSQL
    pub_key_str = base64.b64encode(pub_context_bytes).decode('utf-8')
    
    # 3. Prepare the Secret Key and create an Encrypted Backup
    sec_key_str = base64.b64encode(sec_context_bytes).decode('utf-8')
    encrypted_backup = crypto.encrypt_mfa_secret(sec_key_str)
    
    # 4. Build kwargs safely to not override SQLAlchemy's func.now() default with None
    election_data = {
        "title": election.title,
        "public_key": pub_key_str,
        "secret_key_backup": encrypted_backup,
        "is_active": False,
        "status": "setup",
        "is_exclusive": election.is_exclusive
    }
    if election.start_time:
        election_data["start_time"] = election.start_time
    if election.end_time:
        election_data["end_time"] = election.end_time
        
    new_election = models.Election(**election_data)
    db.add(new_election)
    db.commit()
    db.refresh(new_election)
    
    return {
        "message": "Election Created! Cryptographic keys generated.",
        "election_id": new_election.id
    }

@app.put("/elections/{election_id}/publish")
def publish_election(election_id: int, db: Session = Depends(get_db), current_admin: str = Depends(get_current_admin)):
    db_election = db.query(models.Election).filter(models.Election.id == election_id).first()
    if not db_election:
        raise HTTPException(status_code=404, detail="Election not found.")
    
    candidate_count = db.query(models.Candidate).filter(models.Candidate.election_id == election_id).count()
    if candidate_count < 2:
        raise HTTPException(status_code=400, detail="Cannot publish an election with fewer than 2 candidates.")

    db_election.is_active = True
    db_election.status = "active"
    db.commit()
    
    return {"message": f"Election '{db_election.title}' is now LIVE!"}

@app.put("/elections/{election_id}/close")
def close_election(election_id: int, db: Session = Depends(get_db), current_admin: str = Depends(get_current_admin)):
    db_election = db.query(models.Election).filter(models.Election.id == election_id).first()
    if not db_election:
        raise HTTPException(status_code=404, detail="Election not found.")
    
    if not db_election.is_active:
        raise HTTPException(status_code=400, detail="Election is already closed.")

    db_election.is_active = False
    db_election.status = "closed"
    db.commit()
    
    return {"message": f"Election '{db_election.title}' has been closed. No more votes will be accepted."}

@app.delete("/elections/{election_id}")
def delete_election(election_id: int, db: Session = Depends(get_db), current_admin: str = Depends(get_current_admin)):
    db_election = db.query(models.Election).filter(models.Election.id == election_id).first()
    if not db_election:
        raise HTTPException(status_code=404, detail="Election not found.")
    
    if db.query(models.Ballot).filter(models.Ballot.election_id == election_id).first():
        raise HTTPException(status_code=400, detail="Cannot delete an election after voting has begun to protect audit integrity.")
        
    candidates = db.query(models.Candidate).filter(models.Candidate.election_id == election_id).all()
    photo_urls = [c.photo for c in candidates if c.photo]
        
    db.query(models.Candidate).filter(models.Candidate.election_id == election_id).delete()
    db.delete(db_election)
    db.commit()
    
    for url in photo_urls:
        if url and "/uploads/candidates/" in url:
            try:
                filename = url.split("/")[-1]
                filepath = os.path.join("uploads", "candidates", filename)
                if os.path.exists(filepath):
                    os.remove(filepath)
            except:
                pass
                
    return {"message": f"Election '{db_election.title}' deleted successfully."}


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

    # 3.5. Security Check: Exclusive Election Lock
    if db_election.is_exclusive:
        has_exclusive = db.query(models.VoteRecord).join(
            models.Election, models.VoteRecord.election_id == models.Election.id
        ).filter(
            models.VoteRecord.voter_id == current_voter,
            models.Election.is_exclusive == True
        ).first()
        if has_exclusive:
            raise HTTPException(status_code=400, detail="You have already participated in an exclusive election. You cannot vote in multiple exclusive elections.")

    now = datetime.now()
    if db_election.start_time:
        start_t = db_election.start_time.replace(tzinfo=None) if db_election.start_time.tzinfo else db_election.start_time
        if now < start_t:
            raise HTTPException(status_code=400, detail="Voting for this election has not started yet.")
            
    if db_election.end_time:
        end_t = db_election.end_time.replace(tzinfo=None) if db_election.end_time.tzinfo else db_election.end_time
        if now > end_t:
            raise HTTPException(status_code=400, detail="Voting for this election has ended.")
        
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
    
    # 6. Generate a unique Receipt ID and Digital Fingerprint (Scoping it to the Election)
    raw_uuid = uuid.uuid4().hex
    receipt_id = f"E{db_election.id}-{raw_uuid}"

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
        "digital_fingerprint": vote_fingerprint,
        "timestamp": datetime.now(timezone.utc).isoformat()
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
        decrypted_key = crypto.decrypt_mfa_secret(db_election.secret_key_backup)
        sec_context_bytes = base64.b64decode(decrypted_key)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to retrieve or decrypt the election secret key.")

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
    candidate_details = {}
    for i, candidate in enumerate(candidates):
        if i < len(clean_results):
            results_dict[candidate.name] = clean_results[i]
        else:
            results_dict[candidate.name] = 0
        candidate_details[candidate.name] = {
            "party": candidate.party,
            "photo": candidate.photo
        }

    db_election.final_results = json.dumps(results_dict)
    db.commit()

    return {
        "message": "Election successfully tallied using Homomorphic Encryption!",
        "total_votes_counted": len(ballots),
        "official_results": results_dict,
        "candidate_details": candidate_details
    }

@app.get("/results/")
def get_past_results(db: Session = Depends(get_db)):
    elections = db.query(models.Election).filter(models.Election.is_active == False, models.Election.final_results.isnot(None)).order_by(models.Election.id.desc()).all()
    
    results = []
    for e in elections:
        try:
            official_results = json.loads(e.final_results)
            candidates = db.query(models.Candidate).filter(models.Candidate.election_id == e.id).all()
            candidate_details = {
                c.name: {"party": c.party, "photo": c.photo} for c in candidates
            }
            results.append({
                "id": e.id,
                "title": e.title,
                "official_results": official_results,
                "candidate_details": candidate_details,
                "total_votes": sum(official_results.values()),
                "is_exclusive": e.is_exclusive
            })
        except Exception:
            continue
    return results

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
            receipt = event['receipt_id']
            
            # ISOLATION FIX: If the receipt has the Election ID prefix (e.g., E1-...), 
            # we can safely ignore ghost votes that belong to OTHER elections.
            if receipt.startswith("E") and "-" in receipt:
                event_election_id = receipt.split("-")[0][1:]
                if event_election_id != str(election_id):
                    continue # This ghost vote belongs to a different election. Ignore it here.
                    
            if receipt not in all_db_receipt_ids:
                issues.append(f"GHOST VOTE DETECTED: Blockchain has receipt {receipt} (Tx: {event['transaction_hash']}) but it is missing from the database!")
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

@app.get("/track-vote/{receipt_id}")
def track_vote(receipt_id: str, db: Session = Depends(get_db)):
    """Allows a voter to independently verify their vote hasn't been tampered with."""
    # 1. Get the contract address
    config = db.query(models.SystemConfig).filter(models.SystemConfig.key == "contract_address").first()
    if not config or not config.value:
        raise HTTPException(status_code=500, detail="Blockchain not configured. Cannot verify integrity.")

    # 2. Ask the Blockchain for the truth FIRST
    try:
        on_chain_fingerprint = blockchain.verify_vote_on_chain(config.value, receipt_id)
    except Exception:
        on_chain_fingerprint = ""

    # 3. Fetch ballot from DB
    ballot = db.query(models.Ballot).filter(models.Ballot.receipt_id == receipt_id).first()
    if not ballot:
        # If the blockchain has it, but the DB doesn't, the DB was tampered with (vote deleted)!
        if on_chain_fingerprint and on_chain_fingerprint.strip() != "":
            return {
                "status": "TAMPERED",
                "message": "CRITICAL ALERT: Your vote was securely anchored to the blockchain, but it has been DELETED from the main database! The system has been compromised."
            }
        # If neither has it, it's just a typo.
        raise HTTPException(status_code=404, detail="Tracking ID not found anywhere in the system. No record exists in the database or on the blockchain. Please check for typos.")

    # 4. Recalculate mathematical fingerprint
    fingerprint_payload = f"{ballot.election_id}:{ballot.encrypted_vote_data}"
    current_fingerprint = hashlib.sha256(fingerprint_payload.encode('utf-8')).hexdigest()

    # 5. Verify the actual transaction status
    try:
        tx_receipt = blockchain.w3.eth.get_transaction_receipt(ballot.transaction_hash)
        if tx_receipt.status != 1:
            return {"status": "FAILED", "message": "The transaction failed or is still pending on the blockchain."}

        if on_chain_fingerprint == current_fingerprint:
            return {
                "status": "VERIFIED",
                "election_id": ballot.election_id,
                "timestamp": ballot.timestamp.replace(tzinfo=timezone.utc).isoformat() if ballot.timestamp else None,
                "message": "Your vote is cryptographically verified and securely anchored to the blockchain. It has not been tampered with."
            }
        else:
            return {
                "status": "TAMPERED",
                "message": "CRITICAL ALERT: The database record does not match the permanent blockchain fingerprint! This vote has been tampered with."
            }
    except Exception as e:
        return {"status": "ERROR", "message": f"Could not establish a connection to the blockchain: {str(e)}"}

@app.get("/profile/")
def get_profile(db: Session = Depends(get_db), current_user: str = Depends(auth.get_current_user)):
    voter = db.query(models.Voter).filter(models.Voter.voter_id == current_user).first()
    if not voter:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "name": voter.name or "Unknown",
        "email": voter.email or "Unknown",
        "voter_id": voter.voter_id,
        "is_admin": voter.is_admin,
        "avatar": voter.avatar
    }

@app.put("/profile/avatar/")
def update_avatar(req: AvatarUpdate, request: Request, db: Session = Depends(get_db), current_user: str = Depends(auth.get_current_user)):
    voter = db.query(models.Voter).filter(models.Voter.voter_id == current_user).first()
    if not voter:
        raise HTTPException(status_code=404, detail="User not found")
    
    avatar_url = req.avatar
    if avatar_url and avatar_url.startswith("data:image"):
        old_avatar = voter.avatar
        if old_avatar and "/uploads/avatars/" in old_avatar:
            try:
                old_filename = old_avatar.split("/")[-1]
                old_filepath = os.path.join("uploads", "avatars", old_filename)
                if os.path.exists(old_filepath):
                    os.remove(old_filepath)
            except:
                pass
                
        try:
            header, encoded = avatar_url.split(",", 1)
            ext = utils.validate_image_extension(header)
            filename = f"avatar_{uuid.uuid4().hex[:8]}.{ext}"
            filepath = os.path.join("uploads", "avatars", filename)
            with open(filepath, "wb") as f:
                f.write(base64.b64decode(encoded))
            avatar_url = f"{request.base_url}uploads/avatars/{filename}"
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid avatar format: {str(e)}")
            
    voter.avatar = avatar_url
    db.commit()
    return {"message": "Avatar saved to database successfully."}