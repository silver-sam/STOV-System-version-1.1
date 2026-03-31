import requests
import sys
import json
import time
import pyotp
import os

BASE_URL = "http://localhost:8000"
STATE_FILE = "admin_state.json"
ADMIN_ID = "ADMIN-TEST-01"
ADMIN_PASS = "adminPass123"

def get_admin_headers():
    """Registers (if needed), logs in, and returns JWT headers for the Admin."""
    print(f"🔹 Authenticating Admin ({ADMIN_ID})...")
    
    # 1. Register
    resp = requests.post(f"{BASE_URL}/voters/", json={
        "voter_id": ADMIN_ID, 
        "password": ADMIN_PASS,
        "invite_code": "STOV-ADMIN-MASTER-KEY"
    })
    mfa_secret = None
    
    if resp.status_code == 200:
        mfa_secret = resp.json()['mfa_setup_key']
        # Promote to Admin via DB
        try:
            from app.database import SessionLocal
            from app import models
            db = SessionLocal()
            voter = db.query(models.Voter).filter(models.Voter.voter_id == ADMIN_ID).first()
            if voter:
                voter.is_admin = True
                db.commit()
            db.close()
        except Exception as e:
            print(f"❌ DB Error: {e}")
            sys.exit(1)
    elif "already registered" in resp.text:
        # Fetch MFA secret from DB if user exists
        try:
            from app.database import SessionLocal
            from app import models
            from app import crypto
            db = SessionLocal()
            voter = db.query(models.Voter).filter(models.Voter.voter_id == ADMIN_ID).first()
            if voter:
                mfa_secret = crypto.decrypt_mfa_secret(voter.mfa_secret)
            db.close()
        except Exception:
            print("❌ Could not retrieve MFA secret from DB.")
            sys.exit(1)
    else:
        print(f"❌ Registration Failed: {resp.text}")
        sys.exit(1)

    # 2. Login & Verify MFA
    totp = pyotp.TOTP(mfa_secret)
    resp = requests.post(f"{BASE_URL}/verify-mfa/", json={"voter_id": ADMIN_ID, "mfa_code": totp.now()})
    
    if resp.status_code != 200:
        print(f"❌ Login Failed: {resp.text}")
        sys.exit(1)
        
    token = resp.json()['access_token']
    return {"Authorization": f"Bearer {token}"}

def setup_election(headers):
    print("\n🚀 STARTING ELECTION SETUP")
    
    # 1. Deploy Ledger
    print("🔹 Checking Blockchain Ledger...")
    resp = requests.get(f"{BASE_URL}/deploy-ledger/", headers=headers)
    if resp.status_code == 200:
        print(f"   ✅ Ledger Deployed: {resp.json()['contract_address']}")
    elif "already deployed" in resp.text:
        print("   ✅ Ledger already active.")
    else:
        print(f"❌ Ledger Error: {resp.text}")
        sys.exit(1)

    # 2. Create Election
    title = f"Class President {int(time.time())}"
    print(f"🔹 Creating Election: '{title}'")
    resp = requests.post(f"{BASE_URL}/create-election/", json={"title": title}, headers=headers)
    if resp.status_code != 200:
        print(f"❌ Create Election Failed: {resp.text}")
        sys.exit(1)
        
    data = resp.json()
    election_id = data['election_id']
    secret_key = data['admin_secret_key_DO_NOT_LOSE']
    
    # 3. Add Candidates
    for name in ["Alice", "Bob", "Charlie"]:
        requests.post(f"{BASE_URL}/candidates/", json={"election_id": election_id, "name": name}, headers=headers)
        print(f"   -> Added candidate: {name}")
        
    # 3.5 Generate Voter Tokens
    print("🔹 Generating Voter Tokens...")
    resp = requests.post(f"{BASE_URL}/admin/generate-tokens/", json={"count": 50}, headers=headers)
    if resp.status_code == 200:
        print(f"   ✅ Generated 50 unique registration tokens for students.")

    # 4. Save State
    # Load existing state to preserve history of previous elections
    state_data = {"elections": {}}
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r") as f:
                loaded = json.load(f)
                # Handle migration from old flat format to new dict format
                if "elections" in loaded:
                    state_data = loaded
                elif "election_id" in loaded:
                    state_data["elections"][str(loaded["election_id"])] = {
                        "secret_key": loaded["secret_key"],
                        "title": loaded["title"]
                    }
        except Exception:
            pass

    # Add the new election to the history
    state_data["elections"][str(election_id)] = {
        "secret_key": secret_key,
        "title": title
    }
    state_data["latest_id"] = election_id

    with open(STATE_FILE, "w") as f:
        json.dump(state_data, f)
        
    print(f"\n✅ ELECTION READY (ID: {election_id})")
    print(f"📝 State saved to {STATE_FILE}")
    print("👉 NOW RUN: python test_voter.py")
    print("👉 THEN RUN: python test_admin.py --close")
    print("👉 THEN RUN: python test_admin.py --tally")

def list_stored_elections():
    if not os.path.exists(STATE_FILE):
        print("❌ No election state file found.")
        return

    try:
        with open(STATE_FILE, "r") as f:
            state_data = json.load(f)
            
        print("\n📂 LOCALLY STORED ELECTION KEYS:")
        found = False
        
        # Handle new format
        if "elections" in state_data:
            for eid, data in state_data["elections"].items():
                print(f"   🔑 ID {eid}: {data.get('title', 'Unknown Title')}")
                found = True
                
        # Handle old format or fallback
        if "election_id" in state_data:
            eid = str(state_data["election_id"])
            if "elections" not in state_data or eid not in state_data["elections"]:
                 print(f"   🔑 ID {eid}: {state_data.get('title', 'Unknown Title')} (Legacy Format)")
                 found = True
        
        if not found:
            print("   (No elections found in state file)")
            
    except Exception as e:
        print(f"❌ Error reading state file: {e}")

def reset_local_state():
    if os.path.exists(STATE_FILE):
        os.remove(STATE_FILE)
        print(f"🗑️ Deleted local state file: {STATE_FILE}")
    else:
        print(f"ℹ️ No local state file found ({STATE_FILE}).")

def close_election(headers, election_id_arg=None):
    if not os.path.exists(STATE_FILE):
        print("❌ No active election state found. Run setup first.")
        sys.exit(1)
        
    with open(STATE_FILE, "r") as f:
        state_data = json.load(f)

    # Determine which election to close
    target_id = str(election_id_arg) if election_id_arg else str(state_data.get("latest_id", ""))
    
    # Fallback for old state file format
    if not target_id and "election_id" in state_data:
        target_id = str(state_data["election_id"])

    print(f"\n🔒 CLOSING ELECTION ID: {target_id}")
    resp = requests.put(f"{BASE_URL}/elections/{target_id}/close", headers=headers)
    if resp.status_code != 200:
        print(f"❌ Close Election Failed: {resp.text}")
        sys.exit(1)
    print(f"✅ SUCCESS: {resp.json()['message']}")
    print("👉 NOW RUN: python test_admin.py --tally")

def tally_election(headers, election_id_arg=None):
    if not os.path.exists(STATE_FILE):
        print("❌ No active election state found. Run setup first.")
        sys.exit(1)
        
    with open(STATE_FILE, "r") as f:
        state_data = json.load(f)
        
    # Determine which election to tally
    target_id = str(election_id_arg) if election_id_arg else str(state_data.get("latest_id", ""))
    
    # Retrieve credentials from history
    secret_key = None
    title = "Unknown"

    if "elections" in state_data and target_id in state_data["elections"]:
        data = state_data["elections"][target_id]
        secret_key = data["secret_key"]
        title = data["title"]
    elif "election_id" in state_data and str(state_data["election_id"]) == target_id:
        # Support for old state file format
        secret_key = state_data["secret_key"]
        title = state_data["title"]
    else:
        print(f"❌ Error: Could not find secret key for Election ID {target_id} in {STATE_FILE}")
        print("   Run 'python test_admin.py --list' to see available keys.")
        sys.exit(1)
        
    print(f"\n📊 TALLYING ELECTION: {title} (ID: {target_id})")
    
    payload = {
        "election_id": int(target_id),
        "admin_secret_key": secret_key
    }
    
    resp = requests.post(f"{BASE_URL}/tally-election/", json=payload, headers=headers)
    if resp.status_code != 200:
        print(f"❌ Tally Failed: {resp.text}")
        sys.exit(1)
        
    results = resp.json()['official_results']
    print("🏆 OFFICIAL RESULTS:")
    print(json.dumps(results, indent=2))
    
    print("\n🔍 RUNNING AUDIT...")
    resp = requests.get(f"{BASE_URL}/audit-election/{target_id}")
    audit = resp.json()
    print(f"   Status: {audit['audit_status']}")
    print(f"   Message: {audit['message']}")
    
    if audit['audit_status'] == "VERIFIED":
        print("✅ AUDIT PASSED")
    else:
        print("⚠️ AUDIT FAILED")

def reset_mfa_for_user(headers, voter_id):
    """Admin tool to reset a user's MFA."""
    print(f"\n🔄 RESETTING MFA for user: {voter_id}")
    resp = requests.post(f"{BASE_URL}/admin/reset-mfa/", json={"voter_id": voter_id}, headers=headers)
    if resp.status_code != 200:
        print(f"❌ MFA Reset Failed: {resp.text}")
        sys.exit(1)
    
    data = resp.json()
    print(f"✅ SUCCESS: {data['message']}")
    print(f"   -> New Setup Key: {data['new_mfa_setup_key']}")
    print(f"   -> New QR URI: {data['new_mfa_qr_uri']}")
    print("\n👉 Admin should now provide this new setup key or QR code to the user.")

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--list":
        list_stored_elections()
        sys.exit(0)
        
    if len(sys.argv) > 1 and sys.argv[1] == "--reset":
        reset_local_state()
        sys.exit(0)

    headers = get_admin_headers()
    
    if len(sys.argv) > 2 and sys.argv[1] == "--reset-mfa":
        voter_to_reset = sys.argv[2]
        if not voter_to_reset:
            print("❌ Please provide a voter_id to reset. Usage: python test_admin.py --reset-mfa <VOTER_ID>")
            sys.exit(1)
        reset_mfa_for_user(headers, voter_to_reset)
    elif len(sys.argv) > 1 and sys.argv[1] == "--tally":
        # Allow passing a specific ID: python test_admin.py --tally 5
        eid = sys.argv[2] if len(sys.argv) > 2 else None
        tally_election(headers, eid)
    elif len(sys.argv) > 1 and sys.argv[1] == "--close":
        eid = sys.argv[2] if len(sys.argv) > 2 else None
        close_election(headers, eid)
    else:
        setup_election(headers)