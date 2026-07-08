
import { Button } from "./ui/button";
import { Phone, Mail, Globe, ArrowUp } from "lucide-react";

export function Footer() {
  const handleCall = () => {
    window.location.href = "tel:+918261861224";
  };

  const handleEmail = () => {
    window.location.href = "mailto:support@bitwix.co.in?subject=Footer Contact&body=Hello Bitwix Team,%0D%0A%0D%0AI am interested in your services.%0D%0A%0D%0AThank you.";
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-primary text-primary-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Main Footer Content */}
        <div className="py-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Company Info */}
          <div className="lg:col-span-2">
            <div className="flex items-center mb-4">
              <div className="bg-primary-foreground text-primary px-3 py-2 rounded-lg">
                <span className="font-bold text-lg">Bitwix</span>
              </div>
              <div className="ml-2">
                <p className="text-sm opacity-90">Technologies Pvt. Ltd.</p>
              </div>
            </div>
            <p className="text-primary-foreground/80 mb-6 max-w-md">
              Transforming businesses through innovative digital solutions. We specialize in 
              website development and Android app development, helping companies achieve their 
              digital transformation goals.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button variant="secondary" onClick={handleCall} className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Call Now
              </Button>
              <Button variant="outline" onClick={handleEmail} className="flex items-center gap-2 text-primary-foreground border-primary-foreground hover:bg-primary-foreground hover:text-primary">
                <Mail className="h-4 w-4" />
                Email Us
              </Button>
            </div>
          </div>

          {/* Services */}
          <div>
            <h3 className="font-semibold mb-4">Our Services</h3>
            <ul className="space-y-2 text-primary-foreground/80">
              <li>
                <a href="#services" className="hover:text-primary-foreground transition-colors">
                  Website Development
                </a>
              </li>
              <li>
                <a href="#services" className="hover:text-primary-foreground transition-colors">
                  Android App Development
                </a>
              </li>
              <li>
                <a href="#services" className="hover:text-primary-foreground transition-colors">
                  Custom Development
                </a>
              </li>
              <li>
                <a href="#services" className="hover:text-primary-foreground transition-colors">
                  UI/UX Design
                </a>
              </li>
              <li>
                <a href="#services" className="hover:text-primary-foreground transition-colors">
                  Database Solutions
                </a>
              </li>
            </ul>
          </div>

          {/* Contact Info */}
          <div>
            <h3 className="font-semibold mb-4">Contact Information</h3>
            <div className="space-y-3 text-primary-foreground/80">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                <span>+91-8261861224</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                <span>support@bitwix.co.in</span>
              </div>
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                <span>www.bitwix.co.in</span>
              </div>
            </div>

            {/* Team Members */}
            <div className="mt-6">
              <h4 className="font-medium mb-2">Key Team Members</h4>
              <div className="text-sm text-primary-foreground/80 space-y-1">
                <p>Sunil Hatkadke - Project Manager</p>
                <p>Surekha Misal - HR Executive</p>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <div className="border-t border-primary-foreground/20 py-6">
          <div className="flex flex-wrap justify-center gap-6 mb-4">
            <a href="#home" className="text-primary-foreground/80 hover:text-primary-foreground transition-colors">
              Home
            </a>
            <a href="#about" className="text-primary-foreground/80 hover:text-primary-foreground transition-colors">
              About
            </a>
            <a href="#services" className="text-primary-foreground/80 hover:text-primary-foreground transition-colors">
              Services
            </a>
            <a href="#team" className="text-primary-foreground/80 hover:text-primary-foreground transition-colors">
              Team
            </a>
            <a href="#contact" className="text-primary-foreground/80 hover:text-primary-foreground transition-colors">
              Contact
            </a>
          </div>
        </div>

        {/* Bottom Footer */}
        <div className="border-t border-primary-foreground/20 py-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-primary-foreground/60 text-sm text-center md:text-left">
              © {currentYear} Bitwix Technologies Private Limited. All rights reserved.
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={scrollToTop}
              className="flex items-center gap-2 text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10"
            >
              <ArrowUp className="h-4 w-4" />
              Back to Top
            </Button>
          </div>
        </div>
      </div>

      {/* Floating Action Buttons for Mobile */}
      <div className="fixed bottom-6 right-6 flex flex-col gap-3 md:hidden z-40">
        <Button
          size="sm"
          onClick={handleCall}
          className="w-12 h-12 rounded-full shadow-lg flex items-center justify-center"
        >
          <Phone className="h-5 w-5" />
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleEmail}
          className="w-12 h-12 rounded-full shadow-lg flex items-center justify-center"
        >
          <Mail className="h-5 w-5" />
        </Button>
      </div>
    </footer>
  );
}
