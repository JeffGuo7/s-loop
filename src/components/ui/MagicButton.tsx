import React from 'react'
import { Button as HeroButton, type ButtonProps as HeroButtonProps } from '@heroui/react'

interface MagicButtonProps extends HeroButtonProps {
  children?: React.ReactNode
}

export function MagicButton({ children, className = '', ...props }: MagicButtonProps) {
  return (
    <HeroButton
      className={`relative inline-flex items-center justify-center rounded-lg border border-accent/80 bg-accent text-accent-foreground font-semibold shadow-sm transition-colors duration-150 hover:bg-accent-light ${className}`}
      {...props}
    >
      <span className="relative z-10 flex items-center justify-center gap-2">
        {children}
      </span>
    </HeroButton>
  )
}
