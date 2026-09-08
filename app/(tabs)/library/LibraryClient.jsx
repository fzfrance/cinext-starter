"use client";
import dynamic from "next/dynamic";
import ResponsivePage from "@/components/ui/ResponsivePage";
const Mobile = dynamic(() => import("./LibraryClientMobile"));
const Desktop = dynamic(() => import("./LibraryClientDesktop"));
export default function Page(props) {
  return <ResponsivePage mobile={Mobile} desktop={Desktop} pageProps={props} />;
}
