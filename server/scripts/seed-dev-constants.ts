/** Demo accounts for local development (see seed-dev.ts). Never used by the server itself. */

/** Shared by all demo accounts. Local data only; override with SEED_PASSWORD. */
export const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? 'campus-demo-passphrase';

export const DEMO_STUDENTS = [
  { name: 'Demo Asha', email: 'demo.asha@vitstudent.ac.in', regNo: '99DEM0001' },
  { name: 'Demo Ravi', email: 'demo.ravi@vitstudent.ac.in', regNo: '99DEM0002' },
  { name: 'Demo Meera', email: 'demo.meera@vitstudent.ac.in', regNo: '99DEM0003' },
] as const;
