import { Container, LinearProgress, Typography } from "@mui/material";
export default function Loading() {
  return (
    <Container sx={{ py: 4 }} role="status">
      <Typography>Loading your workspace…</Typography>
      <LinearProgress aria-label="Loading administration" sx={{ mt: 2 }} />
    </Container>
  );
}
