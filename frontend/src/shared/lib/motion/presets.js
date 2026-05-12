export const motionDurations = {
  fast: 'var(--duration-fast, 120ms)',
  base: 'var(--duration-base, 200ms)',
  slow: 'var(--duration-slow, 320ms)',
}

export const motionEasings = {
  standard: 'var(--ease-standard, ease)',
  emphasized: 'var(--ease-emphasized, ease)',
}

export const motionPresets = {
  fadeInFast: {
    duration: motionDurations.fast,
    easing: motionEasings.standard,
  },
  fadeInUp: {
    duration: motionDurations.base,
    easing: motionEasings.standard,
    distance: 8,
  },
  fadeScaleIn: {
    duration: motionDurations.base,
    easing: motionEasings.emphasized,
    scaleFrom: 0.98,
  },
  slideLeftPanel: {
    duration: motionDurations.base,
    easing: motionEasings.emphasized,
    distance: 16,
  },
  slideRightPanel: {
    duration: motionDurations.base,
    easing: motionEasings.emphasized,
    distance: 16,
  },
  statusPulse: {
    duration: motionDurations.slow,
    easing: motionEasings.standard,
  },
  skeletonShimmer: {
    duration: '1.2s',
    easing: 'linear',
  },
}
