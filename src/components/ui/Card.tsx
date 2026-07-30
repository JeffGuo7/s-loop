import { CardRoot, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, type CardRootProps } from '@heroui/react'

interface CardProps extends Omit<CardRootProps, 'variant'> {
  children: React.ReactNode
  className?: string
  variant?: 'primary' | 'secondary' | 'tertiary' | 'glass' | 'default'
}

export function Card({ children, className = '', variant = 'primary', ...props }: CardProps) {
  const variantStyles = {
    primary: "bg-surface border-border shadow-none",
    default: "bg-surface border-border shadow-none",
    secondary: "bg-surface-secondary border-border",
    tertiary: "bg-surface-tertiary/50 border-border-light",
    glass: "bg-surface/94 border-border shadow-sm backdrop-blur-xl"
  }

  const heroVariant = (variant === 'glass' || variant === 'default' || variant === 'primary') ? 'default' : variant

  return (
    <CardRoot 
      variant={heroVariant as any}
      className={`rounded-xl ${variantStyles[variant]} ${className}`}
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
