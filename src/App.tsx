import AppRouter from './router/AppRouter'
import { useUiClickSound } from './hooks/useUiClickSound'
import './App.css'

export default function App() {
  useUiClickSound()

  return <AppRouter />
}
