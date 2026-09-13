import '../../app/styles.css'

/**
 * Shared `meta` fields for this app's stories. The root Storybook wraps every
 * story in the MUI theme of the other apps; `mui: false` opts out, and the
 * import above brings Tailwind and the tokens instead.
 */
export const casStory = {
  parameters: { mui: false, layout: 'padded' },
}

export const casScreenStory = {
  parameters: { mui: false, layout: 'fullscreen' },
}
