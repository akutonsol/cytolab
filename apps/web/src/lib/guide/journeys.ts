// Declarative guided journeys. Adding a new guided flow later = a new entry
// here; the engine and overlay need no changes.

export interface GuideStep {
  id: string;
  title: string;
  body: string;
  /** Short call-to-action shown when the user is on the right screen. */
  hint?: string;
  /** Where this step's target lives. Undefined = narrative-only (any screen). */
  route?: RegExp;
  /** Human location shown when the user isn't on `route` yet. */
  routeLabel?: string;
  /** `data-guide` value of the element to spotlight (when on `route`). */
  target?: string;
  /** The signal that marks this step complete and advances the guide. */
  completeOn: string;
}

export interface Journey {
  id: string;
  name: string;
  steps: GuideStep[];
}

export const JOURNEYS: Journey[] = [
  {
    id: 'tier1-core',
    name: 'Core case workflow',
    steps: [
      {
        id: 'patient',
        title: 'Register the patient',
        body: 'Every case starts with a patient. Open Patients and add one — or bring a batch in via a requisition.',
        hint: 'Click “New Patient”',
        route: /^\/patients/,
        routeLabel: 'People → Patients',
        target: 'new-patient',
        completeOn: 'patient:created',
      },
      {
        id: 'case',
        title: 'Accession the case',
        body: 'Log the specimen as a case, then choose Gynecology or Non-Gynecology and fill the form.',
        hint: 'Click “New Sample”',
        route: /^\/records/,
        routeLabel: 'Lab → Samples',
        target: 'new-sample',
        completeOn: 'record:created',
      },
      {
        id: 'result',
        title: 'Enter the findings',
        body: 'Open the case and add a result sheet — record the cytology findings and save.',
        hint: 'Start a result sheet',
        route: /^\/(records|result-sheets)/,
        routeLabel: 'Results → Result Sheets',
        target: 'add-result-sheet',
        completeOn: 'result:saved',
      },
      {
        id: 'authorize',
        title: 'Authorize the sign-out',
        body: 'A pathologist reviews and signs out the report in the Authorizer.',
        hint: 'Click “Authorize”',
        route: /^\/authorizer/,
        routeLabel: 'Results → Authorizer',
        target: 'authorize',
        completeOn: 'record:approved',
      },
      {
        id: 'bill',
        title: 'Bill the case',
        body: 'Only approved cases are billable. Create an invoice for the signed-out case.',
        hint: 'Click “Create Invoice”',
        route: /^\/billing/,
        routeLabel: 'Finance → Billing',
        target: 'create-invoice',
        completeOn: 'bill:created',
      },
      {
        id: 'pay',
        title: 'Record payment',
        body: 'Record the client’s payment against the bill to close the loop.',
        hint: 'Record a payment',
        route: /^\/(billing|payments)/,
        routeLabel: 'Finance → Payments',
        target: 'record-payment',
        completeOn: 'payment:created',
      },
    ],
  },
  {
    id: 'payroll',
    name: 'Run payroll',
    steps: [
      {
        id: 'employee',
        title: 'Add an employee',
        body: 'Payroll draws from employee records. Set each person up once with their salary and statutory details (TRN, NIS, NHT).',
        hint: 'Click “New Employee”',
        route: /^\/employees/,
        routeLabel: 'People → Employees',
        target: 'new-employee',
        completeOn: 'employee:created',
      },
      {
        id: 'run',
        title: 'Run the payroll',
        body: 'Start a run, set the period, then work the wizard — Earnings → Taxes → Review → Finish. Processing issues a pay advice to every employee.',
        hint: 'Click “Run Payroll”',
        route: /^\/payroll/,
        routeLabel: 'Payroll → Run Payroll',
        target: 'run-payroll',
        completeOn: 'payroll:processed',
      },
    ],
  },
];
