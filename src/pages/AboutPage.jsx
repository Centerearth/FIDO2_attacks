import Layout from '../components/Layout';

export default function AboutPage() {
  return (
    <Layout>
      <div id="about-main">
        <p>
          This project is dedicated to exploring the security of the FIDO2 authentication standard. 
          We have developed a simple shopping website and server that implement FIDO2 to serve as a controlled environment for our research. 
          Our primary goal is to investigate potential vulnerabilities and attack vectors in FIDO2 implementations. 
          This work is being conducted as part of a research paper at BYU aimed at creating a taxonomy of all FIDO2 attacks and determining their relevancy. 
        </p>
        <p>
          2026
        </p>
        <p>
          See <a href="https://github.com/Centerearth/FIDO2_attacks">https://github.com/Centerearth/FIDO2_attacks</a> for the Github repository
        </p>
        <p> 
          See <a href="https://isrl.byu.edu/">https://isrl.byu.edu/</a> for the home page of the Internet Security Research lab (ISRL) at BYU.
        </p>
      </div>
    </Layout>
  );
}
