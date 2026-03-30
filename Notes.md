Notes
Deploy

webauth_signup cookie stores the email and name in plaintext - could be swapped out en route.
Auth token cookie has no maxAge




Deploying to Digital Ocean App Platform
1. Push to GitHub
Make sure your repo is pushed to github.com/Centerearth/FIDO2_attacks.

Add a .gitignore entry for .env if not already there (never commit secrets).

2. Create App on App Platform
Go to cloud.digitalocean.com → App Platform → Create App
Connect GitHub and select your repo
DO will detect Node.js automatically
3. Configure the service
Setting	Value
Build Command	npm install && npm run build
Run Command	npm start
HTTP Port	3000
Plan	Basic ($5/mo is enough to start)
4. Set environment variables
In the App Platform UI, add these under Environment Variables:

Variable	Value
NODE_ENV	production
MONGOUSER	your Atlas username
MONGOPASSWORD	your Atlas password
MONGOHOSTNAME	your Atlas cluster hostname
DB_NAME	your database name
RP_ID	your app's domain (e.g. myapp.ondigitalocean.app)
ORIGIN	https://myapp.ondigitalocean.app
Mark MONGOPASSWORD as secret/encrypted.

5. MongoDB Atlas network access
In Atlas, go to Network Access and add 0.0.0.0/0 (allow all IPs), or add the specific DO outbound IP after first deploy. App Platform uses dynamic IPs, so 0.0.0.0/0 is the practical choice unless you use a dedicated egress IP (paid add-on).

6. WebAuthn / FIDO2 requirement
WebAuthn requires HTTPS and a real domain. App Platform provides both automatically — your app gets a free *.ondigitalocean.app subdomain with TLS. Set RP_ID and ORIGIN to that domain before registering any passkeys.