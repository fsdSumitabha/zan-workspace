Here is the complete navigation architecture document for your Android app based on **Option B (Numerical Range Grouping)** and **Material Design 3 (M3)** standards.

This approach ensures zero bottom-bar clutter, ideal thumb reachability, and automatic compatibility with future backend roles without requiring new Play Store releases.

---

### 1. Navigation Architecture Summary

```
+-------------------------------------------------------+
|  [ Company Logo / Section ]       [🔔]   ( Avatar )   |  <-- Top App Bar
+-------------------------------------------------------+
|                                                       |
|                                                       |
|                    Main Workspace                     |
|                                                       |
|                                                       |
|        +-------------------------------------+        |
|        |  Tab 1  |  Tab 2  |  Tab 3  | Tab 4 |        |  <-- Floating Nav Bar
|        +-------------------------------------+        |
+-------------------------------------------------------+

```

* **Top Header:**
* **Left:** Company Branding / Workspace Title.
* **Right:** `[Notifications Bell]` icon placed directly next to the `[Profile Avatar]` icon (Google Photos style).


* **Profile Action:** Tapping `[Profile Avatar]` slides up a **Material 3 Modal Bottom Sheet** containing secondary tools (like `Users/Directory`, `Lead Sources`, and `Settings`).
* **Bottom Navigation:** A persistent, floating Material 3 navigation bar containing **4 primary working tabs**.

---

### 2. Layout Rules & Role Range Parsing

Roles are parsed dynamically by their ID range:

$$\text{Role Family} = \lfloor \text{Role ID} / 10 \rfloor$$

* **Range `20–29**` $\rightarrow$ **HR Workspace Layout**
* **All Other Active Ranges (`10–19`, `30–80`)** $\rightarrow$ **CRM Workspace Layout**

---

### 3. Layout Specifications

#### Layout A: CRM Workspace (`Roles 10–19` and `30–80`)

Used by Admins, Ops Managers, Project Managers, Developers, Marketers, Sales Agents, Leads Managers, Accountants, and Tech Support.

##### Floating Bottom Navigation Bar (Persistent)

1. **Leads** (`/admin/operations/leads`)
2. **Clients** (`/admin/operations/clients`)
3. **Projects** (`/admin/operations/projects`)
4. **Meetings** (`/admin/operations/meetings`)

##### Profile Modal Bottom Sheet (Secondary Tools)

* **Users & Staff Directory** (`/admin/operations/users`)
* *Access control:* Accessible for authorized roles (`10`, `45`, `69`, etc.); restricted roles attempt to navigate and trigger the 403 authorization check.


* **Lead Sources & Uploads** (`/admin/operations/lead-sources`)
* **App Settings & Preferences**
* **Log Out**

---

#### Layout B: HR Workspace (`Roles 20–29`)

Used by HR Managers, Jr. HR Executives, and HR Operations Staff.

##### Floating Bottom Navigation Bar (Persistent)

1. **Employees** (`/admin/operations/users`)
2. **Attendance** (`/admin/operations/attendance`)
3. **Requests** (`/admin/operations/requests`)
4. **Meetings** (`/admin/operations/meetings`)

##### Profile Modal Bottom Sheet (Secondary Tools)

* **My Profile**
* **App Settings & Preferences**
* **Log Out**

---

### 4. Handling Action-Level Permissions (RBAC)

Because all CRM users share the same 4 bottom tabs (`Leads`, `Clients`, `Projects`, `Meetings`), permission enforcement happens **inside the views**:

| View | Action | Allowed Role IDs | Behavior for Unauthorized Users |
| --- | --- | --- | --- |
| **Leads** | `+ Create Lead` | `10, 15, 45, 50, 60, 69, 70` | Hide `+` floating action button (FAB) |
| **Leads** | `Convert Lead` | `10, 45, 60, 69, 70` | Hide option in context menu |
| **Clients** | `+ Create Project` | `10, 45, 60, 70` | Hide button or disable action |
| **Projects** | `Edit Project` | `10, 45, 60, 70` | Hide edit action |
| **Profile Sheet** | `Users Directory` | `10, 20, 45, 69` | Show in menu; deep link fallback renders 403 page |

---

### 5. Profile Bottom Sheet Structure

When the user taps their profile avatar in the top-right corner, present the following structure:

```
+-------------------------------------------------------+
|                       [ ===== ]                       | <-- Drag Handle
|                                                       |
|   ( Avatar )   John Doe                               |
|                Admin • Role ID: 10                    |
|                                                       |
|   -------------------------------------------------   |
|   OPERATIONS & MANAGEMENT                             |
|   [ 👥 ]  Users & Staff Directory                 >   |
|   [ 📥 ]  Lead Sources & Uploads                  >   |
|                                                       |
|   PREFERENCES                                         |
|   [ ⚙️ ]  App Settings                            >   |
|   [ 🚪 ]  Log Out                                 >   |
+-------------------------------------------------------+

```