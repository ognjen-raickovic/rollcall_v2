export class AuthenticationError extends Error {
  readonly code: string
  constructor(message: string, code: string = 'auth_unavailable') {
    super(message)
    this.code = code
  }
}

export function authError(error: { code?: string; status?: number; name?: string }): AuthenticationError {
  const messages: Record<string, string> = {
    UNAUTHORIZED_INVALID_API_KEY:
      'Supabase rejected this build’s API key. Verify the matching project publishable key, remove stale overrides and rebuild the frontend.',
    invalid_credentials: 'Email or password is incorrect.',
    email_not_confirmed: 'Confirm your email before logging in. You can request another confirmation below.',
    email_address_not_authorized:
      'Staging email delivery is restricted to project-team addresses. Contact the operator or use an approved team email.',
    email_address_invalid: 'This email address is not accepted. Check it and try again.',
    signup_disabled: 'Registration is disabled for this environment. Contact the operator.',
    email_provider_disabled: 'Email registration is not enabled for this environment.',
    user_already_exists: 'This account could not be registered. Try logging in or resetting your password.',
    email_exists: 'This account could not be registered. Try logging in or resetting your password.',
    over_email_send_rate_limit: 'Too many emails requested. Wait before requesting another link.',
    over_request_rate_limit: 'Too many attempts. Please wait before trying again.',
    weak_password: 'Choose a stronger password with at least 8 characters.',
    same_password: 'Choose a password different from your previous password.',
    captcha_failed: 'The required anti-abuse check could not be completed. Contact the staging operator.',
    unexpected_failure:
      'Registration could not be completed. The operator should inspect the Auth error code and database setup.',
    validation_failed: 'Authentication could not accept these details. Check the form and try again.',
    bad_code_verifier:
      'This email link must be opened in the browser that requested it. Request a new link if needed.',
    flow_state_not_found: 'This email session expired or was already used. Request a new link.',
    otp_expired: 'This confirmation or recovery link expired. Request a new link.',
    request_timeout: 'Authentication timed out. Check your connection before trying again.',
  }
  if (error.code && messages[error.code]) return new AuthenticationError(messages[error.code], error.code)
  if (error.status === 401)
    return new AuthenticationError(
      'Supabase rejected the authentication request (401). Verify this build’s project/key pairing and inspect the response error code; the cause is not yet established.',
      'auth_request_rejected',
    )
  if (error.status === 429)
    return new AuthenticationError('Too many attempts. Please wait before trying again.', 'rate_limited')
  if (error.name === 'AuthRetryableFetchError' || error.status === 0)
    return new AuthenticationError(
      'The authentication service could not be reached. Check your connection and project URL.',
      'auth_network_error',
    )
  return new AuthenticationError(
    'Authentication could not be completed. The operator should inspect the response status and error code; no sensitive response details are displayed.',
  )
}
