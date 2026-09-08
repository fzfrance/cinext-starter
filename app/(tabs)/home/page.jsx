"use client";
import dynamic from "next/dynamic";
import ResponsivePage from "@/components/ui/ResponsivePage";
const Mobile = dynamic(() => import("./pageMobile"));
const Desktop = dynamic(() => import("./pageDesktop"));
export default function Page(props) {
  return <ResponsivePage mobile={Mobile} desktop={Desktop} pageProps={props} />;
}
