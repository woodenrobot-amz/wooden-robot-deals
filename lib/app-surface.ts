export const appSurface = process.env.APP_SURFACE === "admin" ? "admin" : "public";

export const isAdminSurface = appSurface === "admin";
