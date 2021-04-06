export const t = {
  login: {
    usernameOrEmail: 'Email or Username',
    password: 'Password',
    submit: 'Sign in',
    // eslint-disable-next-line
    linkToRegister: "Don't have an account? Sign up",
  },
  register: {
    username: 'Username',
    email: 'Email Address',
    password: 'Password',
    confirmPassword: 'Confirm Password',
    submit: 'Sign up',
    linkToLogin: 'Already have an Ligretto account? Sign in',
  },
  validation: {
    username: (minLength: number, maxLength: number) => `The user name must be between ${minLength} and ${maxLength} characters long`,
    password: (minLength: number, maxLength: number) => `The password must be between ${minLength} and ${maxLength} characters long`,
    confirmPassword: 'Passwords are not the same',
    email: 'Email format is incorrect',
  },
  createdByInfo: {
    text: 'Created by:',
  },
  header: 'Ligretto',
  confirmEmail: {
    header: 'Confirm your email address',
    message: ({ email }: { email: string }) =>
      `We have sent an email with a confirmation link to ${email}. In order to complete the sign-up process, please click the confirmation link.
      If you do not receive a confirmation email, please check your spam folder.
      Also, please verify that you entered a valid email address in our sign-up form.
      If you need assistance, please contact us.`,
  },
  profile: {
    save: 'Save',
    email: 'Email',
    username: 'Username',
  },
} as const
