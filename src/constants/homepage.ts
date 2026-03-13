import { ROUTES } from '@/constants/routes'

const HOMEPAGE_LOCALE_PREFIX = '/en'

export const HOMEPAGE_METADATA = {
  title: 'PixelVault | Personal AI Gallery',
  description:
    'Generate with Stable Diffusion XL, Animagine XL 4.0, and Gemini 3.1 Flash Image, then archive every result in one personal gallery.',
} as const

export const HOMEPAGE_ROUTES = {
  home: ROUTES.HOME,
  signIn: `${HOMEPAGE_LOCALE_PREFIX}${ROUTES.SIGN_IN}`,
  signUp: `${HOMEPAGE_LOCALE_PREFIX}${ROUTES.SIGN_UP}`,
  studio: `${HOMEPAGE_LOCALE_PREFIX}${ROUTES.STUDIO}`,
  workflow: '#workflow',
  models: '#models',
} as const

export const HOMEPAGE_COPY = {
  brand: 'PixelVault',
  label: 'Personal AI Gallery',
  brandSubline: 'A personal archive for the images you want to revisit.',
  heroEyebrow: 'Permanent AI archive',
  heroTitle: 'Make images worth keeping.',
  heroDescription:
    'Generate with three distinct image engines, save the winners, and return to a gallery that remembers how you like to create.',
  signedOutPrimaryAction: 'Create your vault',
  signedInPrimaryAction: 'Open the studio',
  signedOutUtilityAction: 'Sign in',
  signedInUtilityAction: 'Continue',
  sharedSecondaryAction: 'See the model lineup',
  signInEyebrow: 'Welcome back',
  signInTitle: 'Return to your private gallery.',
  signInDescription:
    'Sign in to continue generating, reviewing archived results, and tracking credits without losing your creative trail.',
  signInPrimaryAction: 'Need an account?',
  signUpEyebrow: 'Start your collection',
  signUpTitle: 'Open a vault for your best prompts.',
  signUpDescription:
    'Create an account to generate with multiple AI models, archive every keeper, and build a gallery that grows with your taste.',
  signUpPrimaryAction: 'Already registered?',
  authSecondaryAction: 'Back to home',
  authNote:
    'Accounts keep your credits, private prompts, and archived generations in sync across sessions.',
  navigationLabel: 'Homepage',
  stageLabel: 'Gallery preview',
  stageValue: 'Creative direction without guesswork',
  sceneSavedLabel: 'Saved to vault',
  featuresEyebrow: 'Creative advantages',
  featuresTitle: 'Start with the studio. Stay for the archive.',
  featuresDescription:
    'The first visit now makes the value proposition legible: flexible image engines, durable storage, and clear credit behavior.',
  signalModelCoverageLabel: 'Model coverage',
  signalCreditLabel: 'Credit clarity',
  signalArchiveLabel: 'Archive behavior',
  signalModelCoverageSuffix: 'image models across',
  signalModelCoverageTail: 'providers',
  signalCreditPrefix: 'Generation starts at',
  signalCreditSuffix: 'credit per image',
  signalArchiveValue: 'Prompts, outputs, and model choices stay together',
  workflowEyebrow: 'From prompt to archive',
  workflowTitle: 'A creative flow that stays legible.',
  workflowDescription:
    'The entry experience now explains what you can make, how the archive behaves, and why the model choice matters before it asks for commitment.',
  modelsEyebrow: 'Model lineup',
  modelsTitle: 'Three image engines, one vault.',
  modelsDescription:
    'Switch between realism, anime stylization, and fast Gemini exploration without changing tools or losing context.',
  footerEyebrow: 'Built for revisitability',
  footerTitle: 'The image is the output. The archive is the advantage.',
  footerDescription:
    'PixelVault keeps the prompt, model choice, and result together so the next idea starts with context instead of guesswork.',
} as const

export const HOMEPAGE_NAVIGATION = [
  {
    href: HOMEPAGE_ROUTES.workflow,
    label: 'Workflow',
  },
  {
    href: HOMEPAGE_ROUTES.models,
    label: 'Models',
  },
] as const

export const HOMEPAGE_FEATURES = [
  {
    icon: 'sparkles',
    title: 'Choose the right engine',
    description:
      'Move between realism, anime styling, and Gemini-native experimentation from the same studio.',
  },
  {
    icon: 'archive',
    title: 'Keep every keeper',
    description:
      'Strong results do not disappear after one session. They land in a gallery you can revisit later.',
  },
  {
    icon: 'shield',
    title: 'Spend credits with clarity',
    description:
      'Model costs stay visible up front so experimentation feels informed instead of uncertain.',
  },
] as const

export type HomepageFeatureIcon = (typeof HOMEPAGE_FEATURES)[number]['icon']

export const HOMEPAGE_WORKFLOW = [
  {
    step: '01',
    title: 'Frame the idea',
    description:
      'Start with a prompt and choose the model that matches the mood you want before you spend a credit.',
  },
  {
    step: '02',
    title: 'Generate with intent',
    description:
      'Compare photoreal, anime, and Gemini-driven outputs without leaving the same creative surface.',
  },
  {
    step: '03',
    title: 'Archive the winners',
    description:
      'Keep the prompt, model choice, and final image together so future sessions start from context.',
  },
] as const

export const HOMEPAGE_SCENES = [
  {
    tone: 'dawn',
    label: 'Stable Diffusion XL',
    note: 'Detail-rich realism',
    prompt: 'Stormlight sweeping across a quiet brutalist museum courtyard',
  },
  {
    tone: 'forest',
    label: 'Animagine XL 4.0',
    note: 'Anime energy',
    prompt:
      'Courier on a hoverboard threading through a lantern market at dusk',
  },
  {
    tone: 'ink',
    label: 'Gemini 3.1 Flash Image',
    note: 'Fast concepting',
    prompt:
      'Editorial still life of camera parts, metal tools, and pressed flowers',
  },
] as const

export type HomepageSceneTone = (typeof HOMEPAGE_SCENES)[number]['tone']
