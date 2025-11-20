import { Amplify } from "aws-amplify";

export const amplifyConfig = {
  Auth: {
    Cognito: {
      userPoolId: "us-east-1_bdqsU9GjR",
      userPoolClientId: "5i2dhf6pff75v7i0ukvimddt7",
      loginWith: {
        oauth: {
          domain: "us-east-1bdqsu9gjr.auth.us-east-1.amazoncognito.com",
          scopes: ["email", "openid", "phone"],
          redirectSignIn: ["https://uw.sagesure.io/auth/callback"],
          redirectSignOut: ["https://uw.sagesure.io/"],
          responseType: "code",
        },
      },
    },
  },
};

Amplify.configure(amplifyConfig);
