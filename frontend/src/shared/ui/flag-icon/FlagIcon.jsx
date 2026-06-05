import React from 'react'
import { KZ, RU, GB } from 'country-flag-icons/react/3x2'

const FLAGS = { kz: KZ, ru: RU, en: GB }

export function FlagIcon({ lang, size = 16, style, ...props }) {
  const Flag = FLAGS[lang]
  if (!Flag) return null
  return (
    <Flag
      width={size}
      height={Math.round(size * 0.67)}
      style={{ borderRadius: 2, display: 'block', flexShrink: 0, ...style }}
      {...props}
    />
  )
}
