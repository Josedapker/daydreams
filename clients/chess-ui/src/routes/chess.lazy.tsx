import { createLazyFileRoute } from '@tanstack/react-router';
import { ChessUI } from '../components/chess-ui';

export const Route = createLazyFileRoute('/chess')({  
  component: ChessUI
})