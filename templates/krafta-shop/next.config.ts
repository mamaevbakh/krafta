import type { NextConfig } from "next";

const config: NextConfig = {
  // @krafta/commerce ships TypeScript source (workspace package), so Next must
  // transpile it. In a published/ejected shop this is a normal npm dependency.
  transpilePackages: ["@krafta/commerce"],
};

export default config;
