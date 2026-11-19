import './app.css'

// @ts-expect-error Taro's app entry is transpiled before type inference.
function App(props) {
  return props.children
}

export default App
