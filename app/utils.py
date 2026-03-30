import base64
import numpy as np
import cv2

def decode_base64_image(image_str: str):
    """Strips base64 header and decodes into a BGR numpy array for OpenCV."""
    if "," in image_str:
        _, encoded_data = image_str.split(",", 1)
    else:
        encoded_data = image_str
        
    image_bytes = base64.b64decode(encoded_data)
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    return img

def validate_image_extension(header: str):
    ext = header.split(";")[0].split("/")[1].lower()
    if ext not in ["jpg", "jpeg", "png"]:
        raise ValueError(f"Unsupported file type: {ext}")
    return ext