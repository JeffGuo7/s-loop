import { Button as HeroButton, type ButtonProps as HeroButtonProps } from '@heroui/react'

interface ButtonProps extends Omit<HeroButtonProps, 'variant' | 'color' | 'size'> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'ghost-secondary' | 'link'
  size?: 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm'
  isDisabled?: boolean
  title?: string
  children?: React.ReactNode
}

export function Button({ 
  variant = 'primary', 
  size = 'md', 
  className = '', 
  children, 
  isDisabled,
  title,
  ...props 
}: ButtonProps) {
  // Map our custom variants to HeroUI color + variant
  const getHeroProps = () => {
    switch (variant) {
      case 'primary':
        return { color: 'primary' as const, variant: 'solid' as const }
      case 'secondary':
        return { color: 'secondary' as const, variant: 'flat' as const }
      case 'danger':
        return { color: 'danger' as const, variant: 'flat' as const }
      case 'ghost':
        return { color: 'default' as const, variant: 'ghost' as const }
      case 'ghost-secondary':
        return { color: 'secondary' as const, variant: 'ghost' as const }
      case 'link':
        return { color: 'primary' as const, variant: 'light' as const }
      default:
        return { color: 'default' as const, variant: 'solid' as const }
    }
  }

  const { variant: heroVariant } = getHeroProps()

  const sizeMap: Record<string, 'sm' | 'md' | 'lg'> = {
    sm: 'sm',
    md: 'md',
    lg: 'lg',
    icon: 'md',
    'icon-sm': 'sm'
  }

  const isIcon = size === 'icon' || size === 'icon-sm'

  return (
    <HeroButton 
      variant={heroVariant as any}
      size={sizeMap[size]}
      isDisabled={isDisabled}
      className={`font-semibold rounded-xl transition-all duration-300 ${className}`}
      {...(isIcon ? { isIconOnly: true } : {})}
      {...props}
    >
      {children}
    </HeroButton>
  )
}
