// Firebase OIDC JWT verification
// Firebase ID tokens have:
//   iss: "https://securetoken.google.com/whagons-5"
//   aud: "whagons-5"
import { AuthConfig } from "convex/server";

export default {
  providers: [
    {
      domain: "https://securetoken.google.com/whagons-5",
      applicationID: "whagons-5",
    },
  ],
} satisfies AuthConfig;
