import React from 'react'
import { Button as HeroButton, type ButtonProps as HeroButtonProps } from '@heroui/react'

interface MagicButtonProps extends HeroButtonProps {
  children?: React.ReactNode
}

export function MagicButton({ children, className = '', ...props }: MagicButtonProps) {
  return (
    <HeroButton
      className={`relative inline-flex items-center justify-center bg-accent text-accent-foreground font-bold transition-all duration-500 hover:bg-accent-light active:scale-95 shadow-lg shadow-accent/20 ${className}`}
      {...props}
    >
      <span className="relative z-10 flex items-center justify-center gap-2">
        {children}
      </span>
    </HeroButton>
  )
}
