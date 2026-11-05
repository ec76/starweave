"use client";

import {
  Box,
  Drawer,
  IconButton,
  SvgIcon,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useId, useRef, useState, type ReactNode } from "react";

interface HeaderNavigationProps {
  children: ReactNode;
  navigationLabel: string;
  menuLabels: { open: string; close: string };
}

function NavigationContent({
  children,
  navigationLabel,
  menuLabels,
}: HeaderNavigationProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const close = () => setOpen(false);
  const content = (
    <Box
      sx={{
        p: 2,
        minWidth: 0,
        overflowWrap: "anywhere",
        "& a:focus-visible, & button:focus-visible": {
          outline: "2px solid",
          outlineColor: "primary.main",
          outlineOffset: 2,
        },
      }}
    >
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
        <IconButton
          color="primary"
          aria-label={menuLabels.close}
          onClick={close}
          sx={{ minWidth: 44, minHeight: 44 }}
        >
          <SvgIcon aria-hidden="true">
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
            />
          </SvgIcon>
        </IconButton>
      </Box>
      <Box
        component="nav"
        id={id}
        aria-label={navigationLabel}
        onClick={(event) => {
          if ((event.target as Element).closest("a[href]")) close();
        }}
        sx={{
          minWidth: 0,
          "& ul": { flexDirection: "column", gap: 0 },
          "& a": {
            display: "flex",
            width: "100%",
            minWidth: 44,
            minHeight: 44,
          },
        }}
      >
        {children}
      </Box>
    </Box>
  );
  return (
    <>
      <IconButton
        color="primary"
        ref={toggle}
        type="button"
        aria-label={menuLabels.open}
        aria-expanded={open}
        aria-controls={id}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        sx={{ minHeight: 44, minWidth: 44 }}
      >
        <SvgIcon aria-hidden="true">
          <path
            d="M4 6h16M4 12h16M4 18h16"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
          />
        </SvgIcon>
      </IconButton>
      <Drawer
        anchor="right"
        open={open}
        onClose={close}
        ModalProps={{ keepMounted: true, disablePortal: true }}
        slotProps={{
          paper: {
            role: "dialog",
            "aria-modal": true,
            "aria-label": navigationLabel,
            sx: {
              width: "min(22rem, 100vw)",
              maxWidth: "100%",
              overflowY: "auto",
            },
          },
        }}
      >
        {content}
      </Drawer>
    </>
  );
}

export function HeaderNavigation(props: HeaderNavigationProps) {
  const desktop = useMediaQuery(useTheme().breakpoints.up("md"));
  if (desktop)
    return (
      <Box
        component="nav"
        aria-label={props.navigationLabel}
        sx={{ minWidth: 0 }}
      >
        {props.children}
      </Box>
    );
  return <NavigationContent {...props} />;
}
