import { Box, Typography } from "@mui/joy";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useNavigate } from "react-router-dom";
import { larvanderGreen } from "../../styles/colors";

export default function Header({ displayName }) {
  const navigate = useNavigate();

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        mb: { xs: 2, sm: 3 },
        justifyContent: "space-between",
        flexDirection: { xs: "column", sm: "row" },
        gap: { xs: 2, sm: 0 },
      }}
    >
      <Typography
        startDecorator={
          <ArrowBackIcon
            onClick={() => navigate("/dashboard")}
            sx={{
              fontSize: "1.8rem",
              color: "neutral.500",
              display: "none",
              cursor: "pointer",
              "&:hover": {
                color: larvanderGreen,
                transform: "scale(1.1)",
              },
              transition: "all 0.2s ease",
            }}
          />
        }
        sx={{
          fontFamily: "Inter, sans-serif",
          fontWeight: 700,
          fontSize: { xs: "1.5rem", sm: "1.8rem", md: "1.8rem" },
          textAlign: { xs: "center", sm: "left" },
        }}
      >
        Hi {displayName}, let’s chat!
      </Typography>
    </Box>
  );
}
