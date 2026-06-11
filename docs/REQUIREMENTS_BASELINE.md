# Cytolab — Requirements Baseline (extracted from legacy codebase)

Source: legacy `cytolab-microservices` (Spring Boot 2.7, Java 11) + `cytolab-frontend-ui` (CRA/React).
Method: static extraction of all controllers, JPA entities, route constants, permission guards, and Flyway migrations.
Purpose: parity contract for the Cytolab 2.0 rebuild. Every item here must exist (or be consciously retired) in 2.0.

## 1. Module map

| Domain area | Legacy modules | 2.0 module(s) |
|---|---|---|
| Identity & access | auth, user, account, permission, workspace | auth, users, roles, workspaces |
| Lab intake | patient, client, requisition, specimen_record, sample | patients, clients, requisitions, specimens |
| Results & coding | resultsheet, codesheet, codefinding, labcode, cabinet, form | result-sheets, code-sheets, lab-codes, cabinets, reports |
| Revenue | bill, payment, service, taxes | billing, payments, services-catalog, taxes |
| People ops | employee, department, payroll | employees, departments, payroll |
| Platform | message, notification, settings, files, search, reporting, global/dashboard | messaging, notifications, settings, files, search, reports |

## 2. Core workflow (specimen record lifecycle)

The heart of the system is the **Record** (specimen record): a patient's lab case, linked to a client (referring doctor/lab), carrying one or more specimens, lab codes, clinical features/diagnosis, and an optional therapy. Lifecycle (from `status_enum` + service logic):

`Submitted → Processing → Partial → Completed → Approved → Billed → Paid` (with `Pending`, `OnHold`, `Disabled`, `Failed`, `Viewed` as auxiliary states). Result sheets are created against records, filled with result entries/lines, then **authorized** by an Authorizer (Pathologist or Cytologist — `authorizer_enum`). Authorization gates report release. Bills are generated from completed records; payments settle bills.

## 3. Key enumerations (from Flyway migrations)

- **user_enum**: Staff, Authorizer, Superuser, Standard, Client — note: *Client users already exist in legacy*, which 2.0 expands into the full client portal.
- **workspace_enum**: Client, Global, Developer
- **client_enum**: Doctor, Laboratory
- **authorizer_enum**: Pathologist, Cytologist
- **status_enum**: Pending, Paid, Completed, Success, Active, OnHold, Limit, Disabled, Unconfirmed, Confirmed, Approved, Failed, Submitted, Processing, Partial, Billed, Viewed
- **specimen_enum**: (base set) + URINE, CSF, PLEURAL_FLD, BREAST_ASP, JOINT_ASP, SYNOVIAL_FLD, OTHER
- **payment_type_enum**: Cash + Cheque, CreditCard, DebitCard, BankTransfer
- **gender_enum**: Male, Female
- **role_enum** (role scope): Workspace, User

## 4. Permission model

Legacy guards follow `<action>Privilege(user, '<Object>')` with actions: **view, create, change, delete, submit, authorize, reports**. Objects guarded: Account, ApplicationPrefs, Bill, Cabinet, Client, ClinicalItemGroup, CodeSheet, Department, Employee, FormPrintGroup, LabCode, Message, Notification, Patient, PayAdvice, Payment, Payroll, Permission, Record, RecordStatus, Report, Requisition, ResultEntry, ResultSheet, Role, Service, Tax, User.

2.0 keeps the same matrix as permission codes, e.g. `record:view`, `resultsheet:authorize`, `payroll:create`.

## 5. Entity inventory (77 model classes)

| Entity | Fields (abbrev.) |
|---|---|
| Account | accountNo, active, termsAccepted, balance, previousBalance, requestCancel, status, lastBillDate, billCycle, secondaryUsers, owner, workspace, bills, payments |
| AccountPrefs | settings |
| Address | street, streetTwo, city, state, postalCode, country |
| ApplicationPrefs | initDefaults, rootPrefs, prefsGroups |
| Appointment | name, description, confirm, repeat, allDay, dateTime, client, patient |
| AuthAttempt | attempts, inProgress, state, lastAttempt, elapsed, expiryDate, user |
| Authorizer | type, gender, digitalSignature, phoneNumber, user |
| BaseModel | dateCreated, dateUpdated |
| Bill | customerName, accountNo, referenceNo, currency, amountDue, amountPaid, carriedBalance, earlyIncentive, expressFee, taxCode, taxPercent, taxAmount, overDue, viewed … |
| BillInsight | dueDateAsDays, isUnpaid, isOverDue, dueDays, bill |
| BillLine | serviceCost, unit, quantity, expressCost, fees, amount, serviceName, serviceRef, description, record, bill |
| Cabinet | label, identifier, color |
| Client | firstName, lastName, officeName, phoneNumber, mobileNumber, officeNumber, faxNumber, account, user, clientType, labCode, patients, appointments, specimens … |
| ClientType | name, type, clients, dateCreated |
| ClinicalFeatures | id, record, clinicalItems |
| ClinicalFormItem | label, dataType, clinicalItemGroup, printGroup, printable |
| ClinicalItem | name, value, dataType, printable, fromGroupId, printGroupName, printGroupId, clinicalFeatures |
| ClinicalItemGroup | name, form, clinicalItemSet, printGroups |
| CodeFinding | abbreviation, description |
| CodeSheet | abbreviation, description |
| ContentEntity | entityName, entityClass |
| Deduction | amount, percentage, description, type, payAdvice |
| Department | name, employees |
| Earning | amount, rate, unit, description, payAdvice |
| Employee | employeeNo, email, firstName, lastName, middleName, terminated, gender, dateOfBirth, dateHired, terminationDate, details, department, user, payAdvices |
| EmployeeDetails | phoneNumber, nis, trn, payCycle, hourlyRate, salary, sickDays, sickDaysTaken, vacationDays, vacationDaysTaken, fixedSalary, address, employee |
| FileStorage | name, size, type, uuid, format, uploadDirectory |
| FormPrintGroup | name, formItems |
| GenericType | clazz |
| LabCode | code, region, clients, records, dateCreated, dateUpdated |
| Message | body, isRead, tag, readDate, sendDate, headers, pairedMessage, thread |
| MessageHeader | subject, type, sender, recipient, message |
| MessageThread | user, reference, messages |
| Notification | type, title, content, dismiss, workspace |
| Patient | registrationNo, firstName, lastName, middleName, age, phoneNumber, bloodGroup, gender, height, weight, email, dateOfBirth, identityToken, motherMaidenName … |
| PayAdvice | companyName, department, employeeName, employeeNo, trn, nis, grossPay, netPay, grossTaxableIncome, totalDeductions, totalEarnings, grossIncomeCumulate, nhtCumulate, nisCumulate … |
| Payment | referenceNo, amount, isVerified, type, state, bank, chequeNumber, datePaid, paymentLines, account |
| PaymentLine | amount, payment, bill |
| Payroll | status, isApproved, payrollAmount, netAmount, nisAmount, edutaxAmount, nhtAmount, payeAmount, payrollDate, approvedDate, approver, integrityHash, payAdvices |
| Permission | Name, permissionCode, contentEntity, roles |
| Prefs | name, description, prefsGroup, valueSet |
| PrefsGroup | name, identifier, applicationPref, preferences |
| Record | identifier, clinicalDiagnosis, labNumber, doctor, urgent, medicalEntry, billed, status, dateStatus, statuses, labCodes, specimens, workspace, patient … |
| RecordStatus | status, record, records, datePublished |
| RecordStatusId | recordId, statusId |
| RecordStatuses | id, record, status, datePublished |
| Report | authorizerReference, content, signature, digitalSignature, writtenBy, medicalEntry, resultSheet |
| Requisition | Status, amount, entriesCompleted, workspace, requisitionLines, dateReceived |
| RequisitionLine | form, isUrgent, isCompleted, description, record, amount, requisition |
| ResultEntry | resultSheet, specimen, resultLines |
| ResultLine | abbreviation, result, findings, abnormalFinding, resultEntry |
| ResultSheet | authorized, viewed, record, resultEntries, reports |
| Role | role, type, isSuperRole, permissions, workspace |
| SecondaryUser | account, user |
| Service | name, description, cost |
| Setting | name, description, accountPref, valueSet |
| Specimen | label, vialColour, antiserumA, antiserumB, rhSolution, type, bloodGroup, record, client, resultEntry, dateReceived |
| Tax | taxCode, name, percentage, isIncomeTax, thresholdAmount, isDefault, type |
| Therapy | hormone, radiation, surgical, other, record |
| User | username, password, firstName, lastName, email, saltSecret, isSecondary, isBlocked, authAllowed, twoFactorAuth, role, type, client, authorizer … |
| ValueSet | textValue, boolValue, integerValue, minValue, maxValue, floatValue, dataType |
| Workspace | name, identifier, domain, isGlobal, logo, dateCreated, dateUpdated, workspaceConstraint, account, records, notifications |
| WorkspaceConstraint | role, workspaces |

## 6. Endpoint inventory (136 endpoints)

### AccountController
Permissions used: view:Account, view:Payment

```
GET     /account
GET     /account/owner/
GET     /accounts
GET     /accounts/clients
GET     workspace/details
```

### AuthController
```
GET     /authenticate/user
GET     /authenticate/username/
GET     /token/refresh
POST    /authenticate
```

### BillController
Permissions used: change:Bill, create:Bill, view:Bill

```
GET     /bill/{Id}
GET     /bills
GET     /bills/billed
GET     /bills/paid
GET     /bills/summary
GET     /bills/unpaid
POST    /bill/create
PUT     /bill/billed/{Id}
PUT     /bill/viewed/{Id}
```

### CabinetController
Permissions used: change:Cabinet, create:Cabinet, view:Cabinet, view:Patient

```
DELETE  /cabinet/delete/{Id}
GET     /cabinet/records/{Id}
GET     /cabinets
POST    /cabinet/create
PUT     /cabinet/update/{Id}
```

### ClientController
Permissions used: change:Client, create:Client, delete:Client, view:Client

```
DELETE  /client/delete/{Id}
GET     /client/{Id}
GET     /clients
POST    /client
PUT     /client/update/{Id}
```

### CodeFindingController
Permissions used: create:CodeSheet, delete:CodeSheet

```
DELETE  /codefindings/delete/{Id}
GET     /codefindings
POST    /codefindings
```

### CodeSheetController
Permissions used: create:CodeSheet, delete:CodeSheet

```
DELETE  /codesheets/delete/{Id}
GET     /codesheets
POST    /codesheets
```

### DashboardMigrationController
```
GET     /producer/{value}
```

### DepartmentController
Permissions used: create:Department, delete:Department, view:Department

```
DELETE  /department/delete/{Id}
GET     /departments
POST    /departments
```

### EmployeeController
Permissions used: change:Employee, create:Employee, delete:Employee, view:Employee, view:PayAdvice

```
DELETE  /employee/delete/{Id}
GET     /employee/payadvice/{Id}
GET     /employee/{Id}
GET     /employees
POST    /employee
PUT     /employee/terminate/{Id}
PUT     /employee/update/{Id}
```

### FileController
```
GET     /file/download/{filePath:.+}
POST    /file/upload
```

### FormController
Permissions used: change:ClinicalItemGroup, change:FormPrintGroup, create:ClinicalItemGroup, create:FormPrintGroup, delete:ClinicalItemGroup, delete:FormPrintGroup, view:ClinicalItemGroup, view:FormPrintGroup, view:Record

```
DELETE  /form/group/delete/{Id}
DELETE  /form/printGroup/delete/{Id}
GET     /form/details
GET     /form/group
GET     /form/printGroup/{Id}
POST    /form/group/create
POST    /form/printGroup/create
PUT     /form/group/update/{Id}
PUT     /form/printGroup/update/{Id}
```

### GlobalController
```
GET     /dashboard
POST    /workspaceName/update
```

### LabCodeController
Permissions used: create:LabCode, delete:Tax

```
DELETE  /labcodes/delete/{Id}
GET     /labcodes
POST    /labcodes
```

### MessageController
Permissions used: delete:Message, view:Message

```
GET     /messages
GET     /messages/thread/{Id}
GET     /messages/unread
PUT     /messages/delete
PUT     /messages/read
```

### NotificationController
Permissions used: delete:Notification, view:Notification

```
DELETE  /notifications/dismiss
GET     /notifications
```

### PatientController
Permissions used: change:Patient, create:Patient, delete:Patient, view:Patient

```
DELETE  /patient/delete/{Id}
GET     /patient/{Id}
GET     /patients
GET     /patients/client
GET     /patients/search
POST    /patient
PUT     /patient/update/{Id}
```

### PaymentController
Permissions used: change:Payment, create:Payment, view:Payment

```
GET     /bill/payments/{Id}
GET     /payments
GET     /payments/summary
POST    /payment/create
PUT     /payment/verify/{Id}
```

### PayrollController
Permissions used: change:Payroll, create:Payroll, view:PayAdvice, view:Payroll

```
GET     /payroll/payadvice/{Id}
GET     /payrolls
POST    /payroll
PUT     /payroll/approve/{Id}
```

### ReportingController
Permissions used: reports:ApplicationPrefs

```
GET     /reports/summary
POST    /reports
```

### RequisitionController
Permissions used: create:Requisition, view:Requisition

```
DELETE  /requisition/delete/{Id}
DELETE  /requisition/item/delete/{Id}
GET     /requisitions
GET     /requisitions/client/{Id}
GET     /requisitions/{Id}
POST    /requisition/create
```

### ResultSheetController
Permissions used: authorize:ResultSheet, change:ResultEntry, create:Report, create:ResultSheet

```
POST    /resultsheet/create
PUT     /resultsheet/approve/{Id}
PUT     /resultsheet/reports/{Id}
PUT     /resultsheet/update/{Id}
```

### RolePermissionsController
Permissions used: view:Permission, view:Role

```
DELETE  /roles/delete/{Id}
GET     /permissions
GET     /roles
GET     /roles/workspace
POST    /permissions
PUT     /permissions
```

### SearchController
```
GET     /search
```

### ServiceController
Permissions used: create:Bill, create:Service, delete:Service

```
DELETE  /services/delete/{Id}
GET     /services
POST    /services
```

### SettingsController
Permissions used: change:ApplicationPrefs, view:ApplicationPrefs

```
GET     /preferences
PUT     /preferences
```

### SpecimenRecordController
Permissions used: change:Record, change:RecordStatus, create:Record, submit:Record, view:Bill, view:Record

```
DELETE  /specimen/delete/{Id}
GET     /specimens
GET     /specimens/approved
GET     /specimens/billable
GET     /specimens/client
GET     /specimens/patient
GET     /specimens/recent
GET     /specimens/requisition
GET     /specimens/{Id}
PATCH   /specimen/status/{Id}
POST    /file/upload
POST    /specimen/attachment
POST    /specimen/create
PUT     /specimen/submit/{Id}
PUT     /specimen/update/{Id}
```

### TaxesController
Permissions used: create:Tax, delete:Tax, view:Tax

```
DELETE  /taxes/delete/{Id}
GET     /taxes
GET     /taxes/type
POST    /taxes
```

### UserController
Permissions used: change:User, create:User, delete:User, view:User

```
DELETE  /user/delete/{Id}
GET     /user
GET     /users
GET     /users/{Id}
PATCH   /user/authAccess/{Id}
POST    /user/create
PUT     /profile/update/{Id}
PUT     /user/passwordChange
PUT     /user/update/{Id}
```

## 7. Non-functional behaviors to preserve

- JWT auth with refresh tokens; failed-attempt tracking (AuthAttempt) and account lockout
- Paged list endpoints with configurable page size; Redis-backed response caching on hot lists (patients)
- Global search across patients/records/clients (legacy: Elasticsearch → 2.0: Postgres FTS)
- Realtime: unread message counts and notifications over WebSocket
- File uploads attached to specimens/records; PDF report generation and print groups
- Dashboard analytics: record stats, client stats, billing summaries (legacy analytics-service → 2.0 reports module)
