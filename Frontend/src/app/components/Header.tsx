
import { useState } from "react";
import { Button } from "./ui/button";
import { Phone, Mail, Menu, X } from "lucide-react";

export function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleCall = () => {
    window.location.href = "tel:+918261861224";
  };

  const handleEmail = () => {
    window.location.href = "mailto:support@bitwix.co.in?subject=Inquiry from Website&body=Hello Bitwix Team,%0D%0A%0D%0AI am interested in your services. Please get in touch with me.%0D%0A%0D%0AThank you.";
  };

  return (
    <header className="bg-white shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          {/* Logo */}
          <div className="flex items-center">
            <div className="bg-primary text-primary-foreground px-3 py-2 rounded-lg">
              <span className="font-bold text-lg">Bitwix</span>
            </div>
            <div className="ml-2 hidden sm:block">
              <p className="text-sm text-muted-foreground">Technologies Pvt. Ltd.</p>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center space-x-8">
            <a href="#home" className="text-foreground hover:text-primary transition-colors">Home</a>
            <a href="#about" className="text-foreground hover:text-primary transition-colors">About</a>
            <a href="#services" className="text-foreground hover:text-primary transition-colors">Services</a>
            <a href="#team" className="text-foreground hover:text-primary transition-colors">Team</a>
            <a href="#contact" className="text-foreground hover:text-primary transition-colors">Contact</a>
          </nav>

          {/* Contact Buttons - Desktop */}
          <div className="hidden lg:flex items-center space-x-3">
            <Button variant="outline" size="sm" onClick={handleCall} className="flex items-center gap-2">
              <Phone className="h-4 w-4" />
              Call Now
            </Button>
            <Button size="sm" onClick={handleEmail} className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Email Us
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="lg:hidden py-4 border-t">
            <nav className="flex flex-col space-y-4">
              <a 
                href="#home" 
                className="text-foreground hover:text-primary transition-colors py-2"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Home
              </a>
              <a 
                href="#about" 
                className="text-foreground hover:text-primary transition-colors py-2"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                About
              </a>
              <a 
                href="#services" 
                className="text-foreground hover:text-primary transition-colors py-2"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Services
              </a>
              <a 
                href="#team" 
                className="text-foreground hover:text-primary transition-colors py-2"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Team
              </a>
              <a 
                href="#contact" 
                className="text-foreground hover:text-primary transition-colors py-2"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Contact
              </a>
              <div className="flex flex-col space-y-2 pt-4">
                <Button variant="outline" onClick={handleCall} className="flex items-center justify-center gap-2">
                  <Phone className="h-4 w-4" />
                  Call Now
                </Button>
                <Button onClick={handleEmail} className="flex items-center justify-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email Us
                </Button>
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
