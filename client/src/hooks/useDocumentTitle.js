import { useEffect } from 'react'

const APP_NAME = 'V-Nav'

/** Sets the browser tab title to "<page> · V-Nav" while the component is mounted. */
export function useDocumentTitle(page) {
  useEffect(() => {
    const previous = document.title
    document.title = page ? `${page} · ${APP_NAME}` : APP_NAME
    return () => {
      document.title = previous
    }
  }, [page])
}
