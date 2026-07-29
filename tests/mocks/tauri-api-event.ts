export interface Event<T> {
  event: string
  id: number
  payload: T
}

export const listen = async <T>(
  _event: string,
  _handler: (event: Event<T>) => void,
) => () => undefined

export const emit = async (_event: string, _payload?: unknown) => undefined
