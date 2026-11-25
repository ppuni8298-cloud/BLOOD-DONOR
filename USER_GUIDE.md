# BloodLink – Platform User Guide & Operations Manual

This guide describes how each intended user role interacts with the BloodLink platform.

---

## 1. Public Visitor & General User

### Landing Page & Education
- Visit **`index.html`** (or root domain).
- Explore interactive 3D red blood cell visualizations with real-time mouse/touch physics.
- Review the **Blood Compatibility Interactive Matrix** to understand ABO/Rh donor-recipient relationships.
- View live community impact counters, donation guidelines, and FAQs.
- Toggle between Light and Dark mode using the theme switch on the navigation bar.

### Finding Blood Urgently (Public Search)
- Visit **`find-blood.html`**.
- Select blood group (e.g. `O+`, `B-`, `AB+`) and component type (`Whole Blood`, `Packed Red Cells`, `Platelets`, `Plasma`).
- Enter city/district to query active, licensed medical blood banks in your geographic area.
- Click on any verified blood bank to retrieve contact details and facility verification badges.

---

## 2. Donor Journey

### Registration & Profile
1. Navigate to **`auth.html`** &rarr; Select **Donor** role.
2. Enter Full Name, Email, Password, Blood Group, City, and Contact Number.
3. Check email for Supabase verification link and sign in.
4. Access **`donor-dashboard.html`** (automatically routed).

### Core Donor Operations
- **Donation Readiness Toggle**: Toggle your active availability status (Available, Busy, or Medical Cool-off).
- **Appointment Scheduling**: Browse nearby blood donation drives and camps, select a date/slot, and reserve an appointment.
- **Invitation Management**: When an emergency blood match occurs near your location, you receive a real-time invitation. Accept or Decline based on your availability.
- **Donation History**: Track past donations, units donated, and calculate lives impacted (1 donation = up to 3 lives).
- **Privacy Controls**: Control whether your contact number is visible to coordinating medical officers.

---

## 3. Patient & Guardian Journey

### Submitting an Emergency Blood Request
1. Register/Login as a **Patient** on `auth.html`.
2. Navigate to **`patient-dashboard.html`**.
3. Click **"New Emergency Request"** (or use the Code Red emergency button).
4. Fill in:
   - Patient Name & Hospital Ward / Bed ID.
   - Hospital / Clinic name and City.
   - Required Blood Group (e.g., `A-`, `O-`) and Component (`Packed Red Cells`, `Platelets`, `Fresh Frozen Plasma`).
   - Required Units and Urgency Level (`Normal`, `Urgent`, or `Critical - Code Red`).
   - Attending Physician contact and diagnosis notes.
5. Submit the request.

### Tracking Fulfillment
- Monitor real-time status: `Awaiting Verification` &rarr; `Verified by Hospital` &rarr; `Matching Active` &rarr; `Units Dispatched` &rarr; `Fulfilled`.
- View timeline events as nearby blood banks and donors respond to your request.
- Cancel the request if units have already been sourced elsewhere (permitted while status is pending or active).

---

## 4. Hospital Medical Staff Journey

### Operational Command Center (`hospital-dashboard.html`)
- **Emergency Queue**: Review all pending patient requests originating at or transferred to your hospital.
- **Clinical Verification**: Inspect medical documentation and approve requests for automated platform matching.
- **Inventory Overview**: View internal hospital emergency blood storage levels and reserve units from regional blood banks.
- **Transfusion Fulfilment**: When blood units are transfused, record the transfusion event, entering the verifying physician's registration number and unit serial codes to atomically deduct stock.

---

## 5. Blood Bank Operations Journey

### Inventory & Cold-Chain Management (`bloodbank-dashboard.html`)
- **Batch Intake**: Register newly collected units, recording donation batch IDs, component types, collection timestamps, and storage rack positions.
- **Shelf-Life & Expiry Monitoring**: The system automatically flags expiring units (Platelets: 5-day warning; PRBC: 42-day alert).
- **QC Screening**: Record infectious disease testing results (HIV, Hepatitis B/C, Syphilis, Malaria) before releasing units from quarantine to active inventory.
- **Cold-Chain Dispatch**: Fulfill hospital reservations by dispatching units with transport temperature logging, generating tamper-evident transit codes.

---

## 6. Super Admin Operations Journey

### Global Governance (`admin-dashboard.html`)
- **Platform Telemetry**: Inspect real-time nationwide metrics (active donors, pending emergency requests, total transfused units, regional supply levels).
- **Facility Accreditation**: Review license credentials, ISO certifications, and verify hospital and blood bank applications.
- **User Administration**: Search platform users, inspect profile audit logs, and suspend accounts violating safety terms.
- **Emergency Broadcasts**: Send targeted geographic push announcements to donors in specific cities facing acute shortages.
- **Security Incident Response**: Log and track security incidents with automated ticket numbering (`INC-2026-XXXXX`).
- **Clinical Governance Protection**: System-level clinical compatibility parameters are protected and require Medical Board authorization tokens to alter.
