import { CardRoot, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, type CardRootProps } from '@heroui/react'

interface CardProps extends Omit<CardRootProps, 'variant'> {
  children: React.ReactNode
  className?: string
  variant?: 'primary' | 'secondary' | 'tertiary' | 'glass' | 'default'
}

export function Card({ children, className = '', variant = 'primary', ...props }: CardProps) {
  const variantStyles = {
    primary: "bg-surface border-border shadow-sm",
    default: "bg-surface border-border shadow-sm",
    secondary: "bg-surface-secondary/50 border-border-light",
    tertiary: "bg-surface-tertiary/30 border-border-light",
    glass: "glass-card border-white/10"
  }

  const heroVariant = (variant === 'glass' || variant === 'default' || variant === 'primary') ? 'default' : variant

  return (
    <CardRoot 
      variant={heroVariant as any}
      className={`${variantStyles[variant]} ${className}`}
      {...props}
    >
      <CardContent className="p-0 overflow-visible">
        {children}
      </CardContent>
    </CardRoot>
  )
}

Card.Header = CardHeader
Card.Title = CardTitle
Card.Description = CardDescription
Card.Content = CardContent
Card.Footer = CardFooter
