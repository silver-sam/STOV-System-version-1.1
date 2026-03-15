import requests
import sys
import uuid
import pyotp
import random
import concurrent.futures

BASE_URL = "http://localhost:8000"

def run_voter_test(voter_num, election_id, num_candidates):
    # 1. Register a Unique Voter
    voter_id = f"VOTER-{str(uuid.uuid4())[:8]}"
    password = "securePass123"
    
    # Fetch a valid token (Simulating the student checking their email)
    token_resp = requests.get(f"{BASE_URL}/debug/get-unused-token")
    invite_code = token_resp.json().get('token')
    
    if not invite_code:
        print(f"❌ [Voter #{voter_num}] No invite tokens available! Ask Admin to generate more.")
        return

    print(f"🔹 [Voter #{voter_num}] Registering new voter: {voter_id}")
    resp = requests.post(f"{BASE_URL}/voters/", json={
        "voter_id": voter_id, 
        "password": password,
        "invite_code": invite_code
    })
    if resp.status_code != 200:
        print(f"❌ Registration Failed: {resp.text}")
        sys.exit(1)
        
    mfa_secret = resp.json()['mfa_setup_key']
    
    # 3. Login (MFA)
    totp = pyotp.TOTP(mfa_secret)
    resp = requests.post(f"{BASE_URL}/verify-mfa/", json={"voter_id": voter_id, "mfa_code": totp.now()})
    if resp.status_code != 200:
        print(f"❌ MFA Failed: {resp.text}")
        sys.exit(1)
        
    token = resp.json()['access_token']
    headers = {"Authorization": f"Bearer {token}"}
    
    # 2. Cast Vote
    # Randomly vote for a valid candidate index
    choice = random.randint(0, num_candidates - 1)
    print(f"🔹 [Voter #{voter_num}] Casting vote for Candidate Index {choice}...")
    
    vote_payload = {
        "election_id": election_id,
        "candidate_index": choice
    }
    
    resp = requests.post(f"{BASE_URL}/cast-vote/", json=vote_payload, headers=headers)
    if resp.status_code != 200:
        print(f"❌ Voting Failed: {resp.text}")
        sys.exit(1)
        
    data = resp.json()
    print(f"✅ [Voter #{voter_num}] VOTE CAST SUCCESSFULLY!")
    print(f"   Receipt ID: {data['receipt_id']}")
    print(f"   Blockchain TX: {data['blockchain_transaction_hash']}")
    print(f"   Fingerprint: {data['digital_fingerprint']}")

if __name__ == "__main__":
    count = 1
    if len(sys.argv) > 2 and sys.argv[1] == '--count':
        try:
            count = int(sys.argv[2])
        except ValueError:
            print("Invalid count. Please provide a number.")
            sys.exit(1)
            
    # --- SETUP PHASE (Run Once) ---
    print("\n👤 STARTING VOTER SIMULATION")
    resp = requests.get(f"{BASE_URL}/elections/")
    elections = resp.json()
    if not elections:
        print("❌ No active elections found. Ask Admin to run setup.")
        sys.exit(1)
    election = elections[-1]
    
    # Fetch candidates to ensure we vote for valid indices
    resp = requests.get(f"{BASE_URL}/candidates/{election['id']}")
    candidates = resp.json()
    if not candidates:
        print("❌ No candidates found for this election.")
        sys.exit(1)
        
    print(f"🔹 Target Election: '{election['title']}' (ID: {election['id']})")
    print(f"🔹 Candidates: {[c['name'] for c in candidates]}")
    
    num_candidates = len(candidates)
    election_id = election['id']

    # --- EXECUTION PHASE ---
    if count == 1:
        run_voter_test(1, election_id, num_candidates)
    else:
        print(f"🚀 Simulating {count} concurrent voters...")
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(run_voter_test, i + 1, election_id, num_candidates) for i in range(count)]
            
            for future in concurrent.futures.as_completed(futures):
                try:
                    future.result()
                except Exception as exc:
                    print(f'A voter simulation generated an exception: {exc}')
        print("\n✅ All voter simulations complete.")