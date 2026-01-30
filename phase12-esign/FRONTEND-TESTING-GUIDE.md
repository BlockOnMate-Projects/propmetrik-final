# E-Signature Frontend Testing Guide 🧪

**Quick Start**: Test the complete E-signature workflow in 5 minutes

---

## Prerequisites

### 1. Backend Running
```bash
cd /path/to/cedyn-sso/phase12-esign
docker-compose up -d

# Verify services
docker ps
# Should show: postgres, keycloak, minio, esign-backend
```

### 2. Frontend Running
```bash
cd /path/to/cedyn-sso/phase12-esign/frontend
npm install
npm run dev
# Should start at http://localhost:5173
```

---

## Test Scenario 1: Document Upload & Management

### Step 1: Access Dashboard
1. Navigate to `http://localhost:5173`
2. Redirected to Keycloak login
3. Login with test credentials:
   - **Username**: `testuser`
   - **Password**: `testpass`
4. Dashboard loads with "Documents" tab active

### Step 2: Upload Document
1. See upload zone at top of page
2. **Option A**: Drag and drop a PDF file
3. **Option B**: Click "Choose file" and select a PDF
4. Enter document title (auto-filled from filename)
5. Click "Upload Document"
6. ✅ Success toast appears
7. ✅ Document appears in list below

**Expected Result**:
```
✅ Document uploaded successfully
📄 List shows: Title | 2.3 MB | Just now | [Select] [Download] [Delete]
```

### Step 3: Download Document
1. Click **Download** button on any document
2. ✅ Browser downloads file
3. ✅ Filename matches uploaded file

### Step 4: Delete Document
1. Click **Delete** button
2. ✅ Confirmation dialog appears: "Are you sure you want to delete..."
3. Click **OK**
4. ✅ Success toast: "Document deleted successfully"
5. ✅ Document removed from list

---

## Test Scenario 2: Create Signature Request

### Step 1: Select Document
1. From documents list, click **Select** button
2. ✅ "Create Signature Request" modal appears
3. ✅ Title pre-filled from document name

### Step 2: Add Signers
1. Enter first signer:
   - Name: `John Doe`
   - Email: `john@example.com`
   - Order: 1 (auto-assigned)
2. Click **+ Add Signer**
3. Enter second signer:
   - Name: `Jane Smith`
   - Email: `jane@example.com`
   - Order: 2 (auto-assigned)
4. Click **+ Add Signer** again
5. Enter third signer:
   - Name: `Bob Johnson`
   - Email: `bob@example.com`
   - Order: 3 (auto-assigned)

### Step 3: Configure Request
1. **Title**: Keep auto-filled or edit
2. **Message**: Enter "Please sign this contract"
3. **Expires in Days**: 7 (default)
4. Review all fields

### Step 4: Submit Request
1. Click **Create Request**
2. ✅ Success toast: "Signature request created successfully"
3. ✅ Modal closes
4. ✅ Automatically switches to "Signature Requests" tab
5. ✅ New request appears at top of list

**Expected Result**:
```
✅ Signature request created
📝 Status: PENDING | 0/3 signed | Created: Just now
```

---

## Test Scenario 3: View Signature Request Details

### Step 1: Expand Request
1. Click on the signature request card
2. ✅ Card expands to show details:
   - Request title
   - Document title
   - Creation date
   - Expiration date
   - Status badge (yellow "PENDING")
   - Progress: "0/3 signers have signed"

### Step 2: View Signers
1. Scroll down in expanded view
2. ✅ See signer list:
   ```
   #1 John Doe (john@example.com) - [PENDING]
   #2 Jane Smith (jane@example.com) - [PENDING]
   #3 Bob Johnson (bob@example.com) - [PENDING]
   ```

### Step 3: Cancel Request (Optional)
1. Click **Cancel Request** button
2. ✅ Confirmation dialog: "Are you sure you want to cancel..."
3. Click **OK**
4. ✅ Status updates to "CANCELLED" (red badge)
5. ✅ Success toast appears

---

## Test Scenario 4: Public Signing (Manual Testing)

**Note**: Since email sending is not implemented, you need to manually get the access token from backend logs or database.

### Step 1: Get Access Token
**Option A - From Backend Logs**:
```bash
docker logs esign-backend 2>&1 | grep "access_token"
# Look for: Signer 1 token: abc123def456...
```

**Option B - From Database**:
```bash
docker exec -it esign-postgres psql -U cedyn_esign -d cedyn_esign_db
SELECT access_token FROM signature_request_signers WHERE email = 'john@example.com';
\q
```

Copy the token (should be 64 characters).

### Step 2: Access Signing Page
1. Open new browser tab (or incognito window)
2. Navigate to: `http://localhost:5173/sign/{YOUR_TOKEN}`
   - Example: `http://localhost:5173/sign/abc123def456789...`
3. ✅ Page loads WITHOUT Keycloak login (public access)

### Step 3: View Signer Information
✅ Page displays:
- **Request Title**: "Contract Signature Request"
- **Document**: "sample_contract.pdf"
- **Signer**: John Doe (john@example.com)
- **Signing Order**: #1
- **Status**: PENDING (yellow badge)
- **Message**: "Please sign this contract"

### Step 4: Draw Signature
1. Use mouse to draw signature in canvas
2. ✅ Signature appears in real-time
3. Click **Clear** to erase (optional)
4. Draw signature again

### Step 5: Submit Signature
1. Click **✍️ Sign Document**
2. ✅ Button shows "Signing..." (loading state)
3. ✅ Success toast: "Document signed successfully!"
4. ✅ Status updates to "SIGNED" (green badge)
5. ✅ Canvas becomes read-only or hidden

**Expected Result**:
```
✅ You have already signed this document
Status: SIGNED (green)
```

### Step 6: Verify Next Signer Can Sign
1. Get Jane's access token (signer #2)
2. Navigate to `/sign/{JANE_TOKEN}`
3. ✅ Jane's page shows "Status: PENDING"
4. ✅ Jane CAN sign (previous signer completed)
5. Draw and submit signature
6. ✅ Request now shows "2/3 signed"

### Step 7: Verify Signing Order Enforcement
1. Get Bob's access token (signer #3)
2. Navigate to `/sign/{BOB_TOKEN}` BEFORE Jane signs
3. ✅ Warning message: "Please wait for previous signers to complete"
4. ✅ Signature canvas is hidden
5. ✅ Sign button is disabled

---

## Test Scenario 5: Decline Signature Request

### Step 1: Access Signing Page
1. Get access token for any pending signer
2. Navigate to `/sign/{TOKEN}`
3. ✅ Page loads with signer info

### Step 2: Decline Request
1. Click **Decline** button
2. ✅ Dialog appears: "Please provide a reason for declining"
3. Enter reason: "I don't agree with the terms"
4. Click **Confirm Decline**
5. ✅ Button shows "Declining..." (loading state)
6. ✅ Success toast: "Signature request declined"
7. ✅ Status updates to "DECLINED" (red badge)

**Expected Result**:
```
❌ You have declined this signature request
Status: DECLINED (red)
Reason: I don't agree with the terms
```

---

## Test Scenario 6: Pagination & List Management

### Step 1: Test Document Pagination
1. Upload 15+ documents (or use script to bulk upload)
2. ✅ Page shows 10 documents
3. ✅ "Next" button enabled
4. Click **Next**
5. ✅ Shows documents 11-15
6. ✅ "Previous" button enabled
7. Click **Previous**
8. ✅ Returns to documents 1-10

### Step 2: Test Request Pagination
1. Create 10+ signature requests
2. Switch to "Signature Requests" tab
3. ✅ Page shows 6 requests
4. ✅ "Next" button enabled
5. Click **Next**
6. ✅ Shows requests 7-10
7. Click **Previous**
8. ✅ Returns to requests 1-6

---

## Test Scenario 7: Error Handling

### Step 1: Upload Invalid File
1. Try to upload a .txt file
2. ✅ Error toast: "Only PDF, DOC, and DOCX files are allowed"
3. ✅ Upload canceled

### Step 2: Upload Oversized File
1. Try to upload a file over 50MB
2. ✅ Error toast: "File size must be less than 50MB"
3. ✅ Upload canceled

### Step 3: Create Request with Invalid Email
1. Select document
2. Enter signer email: "notanemail"
3. Click **Create Request**
4. ✅ Error toast: "Invalid email format for signer..."
5. ✅ Request not submitted

### Step 4: Sign with Empty Canvas
1. Access signing page
2. Leave canvas empty (don't draw)
3. Click **Sign Document**
4. ✅ Error toast: "Please provide your signature"
5. ✅ Submission canceled

### Step 5: Sign with Expired Token
1. Get an expired access token (expired_at in past)
2. Navigate to `/sign/{EXPIRED_TOKEN}`
3. ✅ Error message: "This signature request could not be found or has expired"

---

## Test Scenario 8: Responsive Design

### Step 1: Mobile View (Dashboard)
1. Open DevTools (F12)
2. Toggle device toolbar (Ctrl+Shift+M)
3. Select "iPhone 12" or "Pixel 5"
4. ✅ Tabs stack vertically or remain horizontal (depending on design)
5. ✅ Upload zone is full-width
6. ✅ Document list scrolls horizontally if needed
7. ✅ Action buttons stack vertically

### Step 2: Mobile View (Signing Page)
1. Navigate to signing page on mobile view
2. ✅ Canvas adapts to screen width
3. ✅ Signature buttons stack vertically
4. ✅ Text remains readable
5. ✅ Touch signing works (if testing on touch device)

---

## Expected API Calls

### Document Upload
```
POST /documents/upload
Content-Type: multipart/form-data
Body: { file: File, title: string }
Response: 201 Created
```

### Create Signature Request
```
POST /signature-requests/
Content-Type: application/json
Body: {
  document_id: 1,
  title: "Contract Signature",
  message: "Please sign",
  signers: [
    { name: "John", email: "john@example.com", order: 1 }
  ],
  expires_in_days: 7
}
Response: 201 Created
```

### Get Signer Info
```
GET /signing/access/{token}
Authorization: None (public)
Response: 200 OK
Body: {
  request_id: 1,
  request_title: "Contract",
  signer_name: "John Doe",
  status: "pending",
  can_sign: true
}
```

### Submit Signature
```
POST /signing/sign/{token}
Content-Type: application/json
Body: {
  signature_data: "data:image/png;base64,iVBOR...",
  signature_type: "drawn"
}
Response: 200 OK
```

---

## Troubleshooting

### Issue: Frontend won't load
**Solution**:
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### Issue: Login redirects to wrong URL
**Solution**: Check Keycloak client redirect URIs
```bash
# Should include:
http://localhost:5173/*
http://localhost:5173/oauth2callback
```

### Issue: API calls return 401
**Solution**: Check Keycloak token in DevTools
```javascript
// Console:
keycloak.token
// Should show JWT token
```

### Issue: Signature request created but signers have null tokens
**Solution**: Check backend logs for token generation
```bash
docker logs esign-backend
# Look for: "Generated access token for signer..."
```

### Issue: Cannot sign (always says "wait for previous signers")
**Solution**: Check signer order in database
```sql
SELECT id, name, email, "order", status 
FROM signature_request_signers 
WHERE signature_request_id = 1 
ORDER BY "order";
```

---

## Performance Benchmarks

**Expected Load Times** (on localhost):
- Dashboard initial load: < 2 seconds
- Document upload (10MB): < 5 seconds
- Document list (100 items): < 1 second
- Signature request creation: < 2 seconds
- Signing page load: < 1 second
- Signature submission: < 2 seconds

**Pagination Performance**:
- Documents list (1000+ items): < 500ms per page
- Requests list (1000+ items): < 500ms per page

---

## Success Criteria

✅ **All tests pass without errors**
✅ **Toast notifications appear for all actions**
✅ **Loading states show during API calls**
✅ **Pagination works in both directions**
✅ **Public signing requires no authentication**
✅ **Signing order is enforced**
✅ **Status badges update in real-time**
✅ **Mobile view is fully functional**

---

## Next Steps After Testing

1. **Deploy to Staging**: Test with real users and email integration
2. **Implement Email Sending**: Backend SMTP configuration
3. **Add PDF Preview**: Integrate PDF.js or similar
4. **Add Real-time Updates**: WebSocket or polling
5. **Add Search/Filter**: Document and request search
6. **Add Audit Logs**: Track all user actions
7. **Add Analytics**: Monitor usage patterns

---

**Testing Complete** ✅  
**Status**: Ready for User Acceptance Testing (UAT)  
**Next**: Deploy to staging environment
