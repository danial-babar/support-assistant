import { useEffect, useId, useRef } from 'react'

interface ComposerProps {
  readonly value: string
  readonly label: string
  readonly placeholder: string
  readonly disabled: boolean
  readonly onChange: (value: string) => void
  readonly onSubmit: () => void
  readonly onTyping: (isTyping: boolean) => void
}

/**
 * Multiline composer. Enter sends. Shift+Enter inserts a newline.
 */
export function Composer({
  value,
  label,
  placeholder,
  disabled,
  onChange,
  onSubmit,
  onTyping,
}: ComposerProps) {
  const id = useId()
  const fieldRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const field = fieldRef.current
    if (!field) {
      return
    }
    field.style.height = '0px'
    field.style.height = `${Math.min(field.scrollHeight, 140)}px`
  }, [value])

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault()
        if (!disabled && value.trim().length > 0) {
          onSubmit()
        }
      }}
    >
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        ref={fieldRef}
        rows={1}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.value)
          onTyping(event.target.value.trim().length > 0)
        }}
        onBlur={() => onTyping(false)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            if (!disabled && value.trim().length > 0) {
              onSubmit()
            }
          }
        }}
      />
      <button type="submit" disabled={disabled || value.trim().length === 0}>
        Send
      </button>
    </form>
  )
}
