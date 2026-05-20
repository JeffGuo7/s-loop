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
    primary: "bg-(--color-surface-secondary)/50 border-(--color-border) hover:border-(--color-accent)/40 focus-within:!border-(--color-accent)",
    secondary: "bg-transparent border-(--color-border) focus-within:!border-(--color-accent)",
    flat: "",
    bordered: "",
    faded: "",
    underlined: ""
  }

  const customClass = (variant === 'primary' || variant === 'secondary') 
    ? variantClasses[variant] 
    : ''

  return (
    <div className={`w-full flex flex-col gap-1.5 ${className}`}>
      {props.label && (
        <label className="text-[11px] font-bold uppercase tracking-widest text-(--color-text-tertiary) ml-1 opacity-70">
          {props.label}
        </label>
      )}
      <div className={`relative flex items-center rounded-xl transition-all duration-300 ${customClass} ${isDisabled ? 'opacity-50' : ''}`}>
        {startContent && (
          <div className="pl-4 text-(--color-text-tertiary)">
            {startContent}
          </div>
        )}
        <HeroInput 
          variant={getHeroVariant()}
          size={getHeroSize()}
          disabled={isDisabled}
          className="w-full"
          classNames={{
            input: "text-sm px-4 py-2.5",
            ...props.classNames
          }}
          {...props}
        />
        {endContent && (
          <div className="pr-4 text-(--color-text-tertiary)">
            {endContent}
          </div>
        )}
      </div>
    </div>
  )
}
