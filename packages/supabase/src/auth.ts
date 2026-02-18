type ErrorLike = {
  code?: string;
  status?: number;
  message?: string;
};

function normalizeMessage(value: unknown) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

export function isRefreshTokenNotFoundError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const e = error as ErrorLike;

  if (e.code === "refresh_token_not_found") return true;
  if (e.status === 400) {
    const message = normalizeMessage(e.message);
    return message.includes("refresh token") && message.includes("not found");
  }

  return false;
}

type GetUserCapable<User> = {
  auth: {
    getUser: () => Promise<{ data: { user: User | null }; error: unknown }>;
  };
};

export async function getUserSafely<User = unknown>(supabase: GetUserCapable<User>) {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (!error) {
      return {
        user: data.user ?? null,
        authError: null,
        refreshTokenMissing: false,
      } as const;
    }

    if (isRefreshTokenNotFoundError(error)) {
      return { user: null, authError: null, refreshTokenMissing: true } as const;
    }

    return { user: null, authError: error, refreshTokenMissing: false } as const;
  } catch (error) {
    if (isRefreshTokenNotFoundError(error)) {
      return { user: null, authError: null, refreshTokenMissing: true } as const;
    }
    return { user: null, authError: error, refreshTokenMissing: false } as const;
  }
}
