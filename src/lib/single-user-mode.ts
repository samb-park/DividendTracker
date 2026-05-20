export const SINGLE_USER_ID_FALLBACK = "sangbong";

export type SingleUserSession = {
  user: {
    id: string;
    email: string;
    name: string;
    image: string | null;
    approved: true;
    role: "ADMIN";
  };
  expires: string;
};

export function getSingleUserId(): string {
  return process.env.DIVIDENDTRACKER_SINGLE_USER_ID?.trim() || SINGLE_USER_ID_FALLBACK;
}

export function getSingleUserEmail(): string {
  return process.env.DIVIDENDTRACKER_SINGLE_USER_EMAIL?.trim() || process.env.ADMIN_EMAIL?.trim() || "sangbong@local";
}

export function getSingleUserSession(): SingleUserSession {
  return {
    user: {
      id: getSingleUserId(),
      email: getSingleUserEmail(),
      name: process.env.DIVIDENDTRACKER_SINGLE_USER_NAME?.trim() || "Sangbong",
      image: null,
      approved: true,
      role: "ADMIN",
    },
    expires: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  };
}
