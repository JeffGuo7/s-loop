import { Input as HeroInput, type InputProps as HeroInputProps } from '@heroui/react'

interface InputProps extends Omit<HeroInputProps, 'variant' | 'size'> {
  variant?: 'primary' | 'secondary'
  size?: 'sm' | 'md' | 'lg'
  startContent?: React.ReactNode
  endContent?: React.ReactNode
  label?: string
  placeholder?: string
  classNames?: any
  isDisabled?: boolean
}

export function Input({ className = '', variant = 'primary', size = 'md', startContent, endContent, isDisabled, ...props }: InputProps) {
  const getHeroVariant = () => {
    return variant as any
  }

  const getHeroSize = () => {
    return size as any
  }

  const variantClasses = {
    primary: "bg-surface-secondary/50 border-border hover:border-accent/40 focus-within:!border-accent shadow-sm",
    secondary: "bg-transparent border-border focus-within:!border-accent",
    flat: "",
    bordered: "",
    faded: "",
    underlined: ""
  }

  const customClass = (variant === 'primary' || variant === 'secondary') 
    ? variantClasses[variant] 
    : ''

  return (
    <div className={`w-full flex flex-col gap-2.5 ${className}`}>
      {props.label && (
        <label className="text-[12px] font-bold uppercase tracking-[0.3em] text-text-tertiary ml-2 opacity-70">
          {props.label}
        </label>
      )}
      <div className={`relative flex items-center rounded-2xl transition-all duration-500 ${customClass} ${isDisabled ? 'opacity-50' : ''}`}>
        {startContent && (
          <div className="pl-6 text-text-tertiary">
            {startContent}
          </div>
        )}
        <HeroInput 
          variant={getHeroVariant()}
          size={getHeroSize()}
          disabled={isDisabled}
          className="w-full"
          classNames={{
            input: "text-[16px] px-6 py-4 font-bold tracking-tight",
            ...props.classNames
          }}
          {...props}
        />
        {endContent && (
          <div className="pr-6 text-text-tertiary">
            {endContent}
          </div>
        )}
      </div>
    </div>
  )
}
