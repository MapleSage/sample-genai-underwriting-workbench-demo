import { CognitoUserPool } from "amazon-cognito-identity-js";
import { cognitoConfig } from "../config/cognito";

const userPool = new CognitoUserPool({
  UserPoolId: cognitoConfig.userPoolId,
  ClientId: cognitoConfig.userPoolWebClientId,
});

export const getAuthHeaders = async (): Promise<Record<string, string>> => {
  return new Promise((resolve, reject) => {
    const currentUser = userPool.getCurrentUser();

    if (!currentUser) {
      resolve({});
      return;
    }

    currentUser.getSession((err: Error | null, session: any) => {
      if (err) {
        console.error("Error getting session:", err);
        resolve({});
        return;
      }

      if (session && session.isValid()) {
        const idToken = session.getIdToken().getJwtToken();
        resolve({
          Authorization: `Bearer ${idToken}`,
        });
      } else {
        resolve({});
      }
    });
  });
};

export const authenticatedFetch = async (
  url: string,
  options: RequestInit = {}
): Promise<Response> => {
  const authHeaders = await getAuthHeaders();

  const headers = {
    ...options.headers,
    ...authHeaders,
  };

  return fetch(url, {
    ...options,
    headers,
  });
};
