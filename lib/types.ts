// Shared between server routes and client pages (no secrets here).
export type Submission = {
  id: string;
  text: string;
  votes: number;
  created_at: string;
};
