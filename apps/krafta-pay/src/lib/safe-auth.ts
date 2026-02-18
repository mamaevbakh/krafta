type ErrorLike = {
  code?: string;
  status?: number;
  message?: string;
};

function isRefreshTokenNotFound(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const e = error as ErrorLike;
  if (e.code === "refresh_token_not_found") return true;
  if (e.status === 400 && typeof e.message === "string") {
    return e.message.toLowerCase().includes("refresh token") &&
      e.message.toLowerCase().includes("not found");
  }
  return false;
}

export async function getUserSafely(
  supabase: {
    auth: {
      getUser: () => Promise<{ data: { user: any | null }; error: unknown }>;
    };
  },
) {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      if (isRefreshTokenNotFound(error)) {
        return { user: null, authError: null } as const;
      }
      return { user: null, authError: error } as const;
    }

    return { user: data.user ?? null, authError: null } as const;
  } catch (error) {
    if (isRefreshTokenNotFound(error)) {
      return { user: null, authError: null } as const;
    }
    return { user: null, authError: error } as const;
  }
}

