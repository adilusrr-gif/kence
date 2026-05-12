import React from 'react'

export function Tooltip({ content, children, side = 'top' }) {
  if (!React.isValidElement(children)) {
    return children ?? null
  }

  return React.cloneElement(children, {
    title: typeof content === 'string' ? content : children.props.title,
    'data-tooltip-side': side,
  })
}
