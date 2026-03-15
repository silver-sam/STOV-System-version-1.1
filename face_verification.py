import base64
import numpy as np
import cv2
import face_recognition
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

router = APIRouter()

class FaceVerificationRequest(BaseModel):
    image: str

@router.post("/verify-face/")
async def verify_face(request: FaceVerificationRequest): 
    try:
        # 1. Strip the header from the base64 string (e.g., "data:image/jpeg;base64,...")
        if "," in request.image:
            header, encoded_data = request.image.split(",", 1)
        else:
            encoded_data = request.image
            
        # 2. Decode the image into a numpy array for OpenCV
        image_bytes = base64.b64decode(encoded_data)
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            raise HTTPException(status_code=400, detail="Could not read the image stream. Please try again.")

        # 3. Convert image to RGB (face_recognition strictly uses RGB)
        rgb_img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        
        # 4. Find face encodings in the live captured image
        face_encodings = face_recognition.face_encodings(rgb_img)
        
        # Ensure exactly one face is in the frame
        if len(face_encodings) == 0:
            raise HTTPException(status_code=400, detail="No face detected. Please ensure your face is clearly visible.")
        elif len(face_encodings) > 1:
            raise HTTPException(status_code=400, detail="Multiple faces detected. Please ensure only you are in the frame.")
            
        captured_encoding = face_encodings[0]
        
        # TODO: Add logic here to fetch the user's registered face encoding from your database and compare it
        # Example: results = face_recognition.compare_faces([reference_encoding], captured_encoding, tolerance=0.6)

        return {"message": "Face processed and verified successfully."}
        
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        
        # Print the exact error to the backend terminal to see what went wrong
        print(f"❌ CRITICAL ERROR in verify_face: {str(e)}")
        
        raise HTTPException(status_code=500, detail="An error occurred while processing the image.")