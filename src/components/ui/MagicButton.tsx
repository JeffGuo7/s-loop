import React from 'react'
import { Button as HeroButton, type ButtonProps as HeroButtonProps } from '@heroui/react'

interface MagicButtonProps extends HeroButtonProps {
  children: React.ReactNode
}

export function MagicButton({ children, className = '', ...props }: MagicButtonProps) {
  return (
    <HeroButton
      className={`relative inline-flex h-12 overflow-hidden rounded-xl p-[1px] focus:outline-none focus:ring-2 focus:ring-(--color-accent)/40 focus:ring-offset-2 focus:ring-offset-(--color-bg) ${className}`}
      {...props}
    >
      <span
        className="absolute inset-[-1000%] animate-[spin_2s_linear_infinite]"
        style={{
          background: `conic-gradient(from 90deg at 50% 50%, var(--color-accent-lighter) 0%, var(--color-accent) 50%, var(--color-accent-lighter) 100%)`,
        }}
      />
      <span className="inline-flex h-full w-full cursor-pointer items-center justify-center rounded-xl bg-(--color-accent) px-3 py-1 text-sm font-medium text-(--color-accent-foreground) backdrop-blur-3xl">
        {children}
      </span>
    </HeroButton>
  )
}
