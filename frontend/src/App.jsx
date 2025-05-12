import { BrowserRouter, Routes, Route } from 'react-router-dom';
import VideoCall from './components/VideoCall';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/room/:roomId" element={<VideoCall />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
