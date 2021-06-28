export const t = {
  login: {
    usernameOrEmail: 'Email or Username',
    password: 'Password',
    submit: 'Sign in',
    // eslint-disable-next-line
    linkToRegister: "Don't have an account? Sign up",
    userNotFound: 'User not found. Check login/email and password',
    usernameError: 'Username required',
    passwordError: 'Password required',
  },
  register: {
    username: 'Username',
    email: 'Email Address',
    password: 'Password',
    confirmPassword: 'Confirm Password',
    submit: 'Sign up',
    linkToLogin: 'Already have an Ligretto account? Sign in',
    userAlreadyExistsError: 'User with a same username or password exists',
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
  avatarDropZone: {
    text: 'Upload',
  },
  dropBox: {
    text: 'Drop avatar here',
  },
  header: 'Ligretto',
  confirmEmail: {
    header: 'Congratulations',
    message: 'We have sent an email with a confirmation link to ',
    messageEnd: 'In order to complete the sign-up process, please click the confirmation link.',
    submessage:
      'If you do not receive a confirmation email, please check your spam folder.\n      Also, please verify that you entered a valid email address in our sign-up form.\n      If you need assistance, please contact us.',
  },
  profile: {
    save: 'Save',
    email: 'Email',
    username: 'Username',
    maxFileSizeError: 'File size exceeds maximum limit 2 MB',
  },
} as const
